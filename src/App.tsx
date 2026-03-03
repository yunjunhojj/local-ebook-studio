import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { Prec } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { Decoration, EditorView, keymap, WidgetType } from "@codemirror/view";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import "highlight.js/styles/github-dark.css";
import "./App.css";
import { useEditorStore } from "./store";
import type { AssetEntry, Book, Chapter, ProjectData } from "./types";
import { buildEpub } from "./lib/epub";
import { markdownToHtml, mergeBookMarkdown, renderBookHtml } from "./lib/markdown";
import { formatBytes, nowIso, slugify, words } from "./lib/strings";

type NewBookForm = {
  title: string;
  author: string;
  language: "en" | "ko";
  description: string;
};

type AiProvider = "openai" | "anthropic" | "gemini";
type AiContextMode = "cursor" | "chapter" | "outline" | "full";

type AiSettings = {
  enabled: boolean;
  provider: AiProvider;
  apiKey: string;
  model: string;
  contextMode: AiContextMode;
  systemPrompt: string;
  userPrompt: string;
  autoSuggest: boolean;
};

const defaultForm: NewBookForm = {
  title: "Building a Browser from Scratch",
  author: "Local Ebook Studio Author",
  language: "en",
  description: "A practical ebook about browser internals, parsing, layout, and painting.",
};

const defaultAiSettings: AiSettings = {
  enabled: false,
  provider: "openai",
  apiKey: "",
  model: "gpt-4.1-mini",
  contextMode: "cursor",
  systemPrompt:
    "You are an ebook writing assistant. Continue the author's current sentence naturally and concisely.",
  userPrompt:
    "Suggest the next short phrase or sentence for the current cursor position. Match the book language and style.",
  autoSuggest: false,
};

const providerModels: Record<AiProvider, string> = {
  openai: "gpt-4.1-mini",
  anthropic: "claude-3-5-haiku-latest",
  gemini: "gemini-2.5-flash",
};

const providerModelOptions: Record<AiProvider, string[]> = {
  openai: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o"],
  anthropic: ["claude-3-5-haiku-latest", "claude-3-5-sonnet-latest", "claude-3-7-sonnet-latest"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-1.5-flash"],
};

class GhostTextWidget extends WidgetType {
  constructor(private readonly text: string) {
    super();
  }

  eq(other: GhostTextWidget) {
    return other.text === this.text;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-ai-ghost-text";
    span.textContent = this.text;
    span.setAttribute("aria-hidden", "true");
    return span;
  }

  ignoreEvent() {
    return true;
  }
}

const copy = {
  en: {
    eyebrow: "Local-first publishing",
    title: "Local Ebook Studio",
    startCopy: "Write developer ebooks as structured Markdown projects with chapter previews and export-ready output.",
    bookTitle: "Book title",
    author: "Author",
    language: "Language",
    description: "Description",
    newBook: "New Book",
    openProject: "Open Project",
    recentProjects: "Recent projects",
    recentProjectsEmpty: "Recent project tracking will appear here after the editor is used.",
    chooseCreateDir: "Choose where to create the book project",
    chooseProjectDir: "Choose a book project folder",
    openedPrefix: "Opened",
    project: "Project",
    save: "Save",
    export: "Export",
    currentChapter: "Current chapter",
    fullBook: "Full book",
    mobileWidth: "Mobile width",
    a4Width: "A4 width",
    light: "Light",
    dark: "Dark",
    bookInfo: "Book Info",
    chapters: "Chapters",
    add: "Add",
    words: "words",
    moveUp: "Move up",
    moveDown: "Move down",
    rename: "Rename",
    delete: "Delete",
    assets: "Assets",
    refresh: "Refresh",
    aiAssistant: "AI Assistant",
    aiEnabled: "Enable AI",
    aiProvider: "Provider",
    aiModel: "Model",
    aiModelCustom: "Custom model",
    aiModelCustomPlaceholder: "Enter model name",
    aiApiKey: "API key",
    aiApiKeyPlaceholder: "Stored only in this local app",
    aiContext: "Context",
    aiContextCursor: "Cursor nearby",
    aiContextChapter: "Current chapter",
    aiContextOutline: "Book outline + cursor",
    aiContextFull: "Full book",
    aiSystemPrompt: "System prompt",
    aiUserPrompt: "Completion prompt",
    aiAutoSuggest: "Auto suggest",
    aiTest: "Test connection",
    aiTesting: "Testing connection...",
    aiTestOk: "AI connection works.",
    aiSuggest: "Suggest",
    aiAccept: "Accept",
    aiDismiss: "Dismiss",
    aiSuggestion: "AI suggestion",
    aiMissingKey: "Add an AI API key first.",
    aiNoChapter: "Open a chapter before requesting completion.",
    aiThinking: "Requesting AI suggestion...",
    aiReady: "AI suggestion ready. Press Tab to accept.",
    aiEmpty: "AI returned an empty suggestion. Try adding more text near the cursor or adjusting the prompt.",
    noChapter: "No chapter selected",
    dropImages: "Drop images here to copy them into assets/images.",
    preview: "Preview",
    chapterTitlePrompt: "Chapter title",
    chapterFallback: "Chapter",
    renamePrompt: "Rename chapter",
    renameSave: "Save name",
    renameCancel: "Cancel",
    deleteConfirm: (title: string) => `Delete "${title}"? This removes the chapter file.`,
    exported: "Exported Markdown, HTML, EPUB, and print HTML.",
  },
  ko: {
    eyebrow: "로컬 우선 출판",
    title: "Local Ebook Studio",
    startCopy: "개발자 전자책을 챕터 기반 Markdown 프로젝트로 작성하고 미리보기와 내보내기까지 처리합니다.",
    bookTitle: "책 제목",
    author: "저자",
    language: "언어",
    description: "설명",
    newBook: "새 책 만들기",
    openProject: "프로젝트 열기",
    recentProjects: "최근 프로젝트",
    recentProjectsEmpty: "최근 프로젝트 기록은 에디터를 사용한 뒤 여기에 표시됩니다.",
    chooseCreateDir: "책 프로젝트를 만들 위치를 선택하세요",
    chooseProjectDir: "책 프로젝트 폴더를 선택하세요",
    openedPrefix: "열림",
    project: "프로젝트",
    save: "저장",
    export: "내보내기",
    currentChapter: "현재 챕터",
    fullBook: "전체 책",
    mobileWidth: "모바일 폭",
    a4Width: "A4 폭",
    light: "라이트",
    dark: "다크",
    bookInfo: "책 정보",
    chapters: "챕터",
    add: "추가",
    words: "단어",
    moveUp: "위로 이동",
    moveDown: "아래로 이동",
    rename: "이름 변경",
    delete: "삭제",
    assets: "에셋",
    refresh: "새로고침",
    aiAssistant: "AI 보조",
    aiEnabled: "AI 사용",
    aiProvider: "제공자",
    aiModel: "모델",
    aiModelCustom: "직접 입력",
    aiModelCustomPlaceholder: "모델명을 입력하세요",
    aiApiKey: "API 키",
    aiApiKeyPlaceholder: "이 로컬 앱에만 저장됩니다",
    aiContext: "컨텍스트",
    aiContextCursor: "커서 주변",
    aiContextChapter: "현재 챕터",
    aiContextOutline: "책 목차 + 커서",
    aiContextFull: "전체 책",
    aiSystemPrompt: "시스템 프롬프트",
    aiUserPrompt: "자동완성 프롬프트",
    aiAutoSuggest: "자동 제안",
    aiTest: "연결 테스트",
    aiTesting: "연결 테스트 중...",
    aiTestOk: "AI 연결이 정상입니다.",
    aiSuggest: "제안 생성",
    aiAccept: "적용",
    aiDismiss: "닫기",
    aiSuggestion: "AI 제안",
    aiMissingKey: "먼저 AI API 키를 입력하세요.",
    aiNoChapter: "자동완성을 요청하기 전에 챕터를 여세요.",
    aiThinking: "AI 제안을 요청하는 중...",
    aiReady: "AI 제안이 준비됐습니다. Tab으로 적용하세요.",
    aiEmpty: "AI가 빈 제안을 반환했습니다. 커서 주변에 본문을 조금 더 작성하거나 프롬프트를 조정해보세요.",
    noChapter: "선택한 챕터 없음",
    dropImages: "이미지를 여기에 놓으면 assets/images로 복사됩니다.",
    preview: "미리보기",
    chapterTitlePrompt: "챕터 제목",
    chapterFallback: "챕터",
    renamePrompt: "챕터 이름 변경",
    renameSave: "이름 저장",
    renameCancel: "취소",
    deleteConfirm: (title: string) => `"${title}" 챕터를 삭제할까요? 챕터 파일도 삭제됩니다.`,
    exported: "Markdown, HTML, EPUB, 인쇄용 HTML을 내보냈습니다.",
  },
};

function normalizeLanguage(language?: string): "en" | "ko" {
  return language === "ko" ? "ko" : "en";
}

function normalizeAiContextMode(value?: string): AiContextMode {
  if (value === "chapter" || value === "outline" || value === "full") return value;
  return "cursor";
}

function App() {
  const {
    rootPath,
    book,
    selectedChapterId,
    chapterContent,
    allChapterContent,
    assets,
    previewMode,
    previewTheme,
    saveState,
    message,
    setProject,
    setBook,
    setSelectedChapterId,
    setChapterContent,
    setAllChapterContent,
    setAssets,
    setPreviewMode,
    setPreviewTheme,
    setSaveState,
    setMessage,
    reset,
  } = useEditorStore();
  const [form, setForm] = useState<NewBookForm>(defaultForm);
  const [previewHtml, setPreviewHtml] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [renamingChapterId, setRenamingChapterId] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");
  const [aiSettings, setAiSettings] = useState<AiSettings>(defaultAiSettings);
  const [aiSuggestion, setAiSuggestion] = useState("");
  const [aiStatus, setAiStatus] = useState("");
  const [isAiBusy, setIsAiBusy] = useState(false);
  const [cursorOffset, setCursorOffset] = useState(0);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const aiRequestIdRef = useRef(0);
  const lang = normalizeLanguage(book?.language ?? form.language);
  const t = copy[lang];

  const selectedChapter = useMemo(
    () => book?.chapters.find((chapter) => chapter.id === selectedChapterId) ?? null,
    [book, selectedChapterId],
  );
  const selectedProviderModels = providerModelOptions[aiSettings.provider];
  const isCustomAiModel = !selectedProviderModels.includes(aiSettings.model);

  const acceptAiSuggestion = () => {
    if (!aiSuggestion || !editorRef.current?.view) return false;

    const view = editorRef.current.view;
    const position = view.state.selection.main.head;
    view.dispatch({
      changes: { from: position, to: position, insert: aiSuggestion },
      selection: { anchor: position + aiSuggestion.length },
    });
    view.focus();
    setAiSuggestion("");
    setAiStatus("");
    return true;
  };

  const editorExtensions = useMemo(
    () => [
      markdown(),
      EditorView.decorations.of((view) => {
        if (!aiSuggestion) return Decoration.none;
        const position = view.state.selection.main.head;
        return Decoration.set([
          Decoration.widget({
            widget: new GhostTextWidget(aiSuggestion),
            side: 1,
          }).range(position),
        ]);
      }),
      Prec.highest(keymap.of([
        {
          key: "Tab",
          run: () => acceptAiSuggestion(),
          preventDefault: true,
        },
        {
          key: "Escape",
          run: () => {
            if (!aiSuggestion) return false;
            setAiSuggestion("");
            setAiStatus("");
            return true;
          },
        },
      ])),
    ],
    [aiSuggestion],
  );

  useEffect(() => {
    if (!rootPath || !selectedChapter) return;

    let cancelled = false;
    invoke<string>("read_text", { rootPath, relativePath: selectedChapter.path })
      .then((content) => {
        if (cancelled) return;
        setChapterContent(content);
        setAllChapterContent({ ...allChapterContent, [selectedChapter.id]: content });
        setSaveState("saved");
      })
      .catch((error) => setMessage(String(error)));

    return () => {
      cancelled = true;
    };
  }, [rootPath, selectedChapterId]);

  useEffect(() => {
    const stored = window.localStorage.getItem("local-ebook-studio.aiSettings");
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored);
      setAiSettings({
        ...defaultAiSettings,
        ...parsed,
        contextMode: normalizeAiContextMode(parsed.contextMode),
      });
    } catch {
      setAiSettings(defaultAiSettings);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("local-ebook-studio.aiSettings", JSON.stringify(aiSettings));
  }, [aiSettings]);

  useEffect(() => {
    if (!rootPath || !book || !selectedChapter || saveState !== "dirty") return;

    const timer = window.setTimeout(async () => {
      try {
        setSaveState("saving");
        await invoke("write_text", {
          rootPath,
          relativePath: selectedChapter.path,
          content: chapterContent,
        });
        const latestBook = useEditorStore.getState().book;
        await invoke("save_book", { rootPath, book: latestBook ?? book });
        setAllChapterContent({ ...allChapterContent, [selectedChapter.id]: chapterContent });
        setSaveState("saved");
      } catch (error) {
        setSaveState("error");
        setMessage(String(error));
      }
    }, 700);

    return () => window.clearTimeout(timer);
  }, [rootPath, book, selectedChapter?.id, chapterContent, saveState]);

  useEffect(() => {
    if (!book) {
      setPreviewHtml("");
      return;
    }

    const source =
      previewMode === "chapter" || previewMode === "mobile"
        ? chapterContent
        : mergeBookMarkdown(book, { ...allChapterContent, [selectedChapterId ?? ""]: chapterContent });

    markdownToHtml(source)
      .then(setPreviewHtml)
      .catch((error) => setPreviewHtml(`<p>${String(error)}</p>`));
  }, [book, chapterContent, allChapterContent, selectedChapterId, previewMode]);

  useEffect(() => {
    if (previewMode === "book" || previewMode === "a4") {
      loadAllChapterContent().catch((error) => setMessage(String(error)));
    }
  }, [previewMode, book?.chapters.length, rootPath]);

  useEffect(() => {
    if (!aiSettings.enabled || !aiSettings.autoSuggest || !selectedChapter || !chapterContent) return;
    if (!aiSettings.apiKey.trim() || isAiBusy || aiSuggestion) return;
    if (chapterContent.trim().length < 24) return;

    const timer = window.setTimeout(() => {
      requestAiCompletion();
    }, 900);

    return () => window.clearTimeout(timer);
  }, [
    aiSettings.enabled,
    aiSettings.autoSuggest,
    aiSettings.apiKey,
    aiSettings.provider,
    aiSettings.model,
    aiSettings.contextMode,
    aiSettings.systemPrompt,
    aiSettings.userPrompt,
    selectedChapterId,
    chapterContent,
    allChapterContent,
    cursorOffset,
    aiSuggestion,
    isAiBusy,
  ]);

  async function createProject() {
    const parentDir = await open({
      directory: true,
      multiple: false,
      title: t.chooseCreateDir,
    });

    if (typeof parentDir !== "string") return;

    setIsBusy(true);
    try {
      const project = await invoke<ProjectData>("create_project", { input: { ...form, parentDir } });
      await hydrateProject(project);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function openProject() {
    const projectPath = await open({
      directory: true,
      multiple: false,
      title: t.chooseProjectDir,
    });

    if (typeof projectPath !== "string") return;

    setIsBusy(true);
    try {
      const project = await invoke<ProjectData>("open_project", { projectPath });
      await hydrateProject(project);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function loadAssets(path = rootPath) {
    if (!path) return;
    const loadedAssets = await invoke<AssetEntry[]>("list_assets", { rootPath: path });
    setAssets(loadedAssets);
  }

  function updateAiSettings(next: Partial<AiSettings>) {
    setAiSuggestion("");
    setAiStatus("");
    setAiSettings((current) => {
      const updated = { ...current, ...next };
      if (next.provider && !next.model) {
        updated.model = providerModels[next.provider];
      }
      return updated;
    });
  }

  function buildAiCompletionContext(chapterContents = allChapterContent) {
    const contentByChapter = { ...chapterContents, [selectedChapterId ?? ""]: chapterContent };
    const beforeCursor = chapterContent.slice(Math.max(0, cursorOffset - 2600), cursorOffset);
    const afterCursor = chapterContent.slice(cursorOffset, cursorOffset + 900);

    if (!book || !selectedChapter) {
      return { beforeCursor, afterCursor };
    }

    if (aiSettings.contextMode === "chapter") {
      return {
        beforeCursor: `Current chapter content before cursor:\n${chapterContent.slice(0, cursorOffset)}`,
        afterCursor: `Current chapter content after cursor:\n${chapterContent.slice(cursorOffset)}`,
      };
    }

    const outline = book.chapters
      .map((chapter) => `${chapter.order}. ${chapter.title} (${chapter.status})`)
      .join("\n");

    if (aiSettings.contextMode === "outline") {
      return {
        beforeCursor: `Book outline:\n${outline}\n\nCurrent chapter content before cursor:\n${beforeCursor}`,
        afterCursor: `Current chapter content after cursor:\n${afterCursor}`,
      };
    }

    if (aiSettings.contextMode === "full") {
      const fullBookContext = book.chapters
        .map((chapter) => {
          const content = contentByChapter[chapter.id] ?? "";
          return `# ${chapter.title}\n\n${content}`;
        })
        .join("\n\n---\n\n");

      return {
        beforeCursor: `Full book context:\n${fullBookContext}\n\nCursor is in "${selectedChapter.title}" after this text:\n${chapterContent.slice(
          0,
          cursorOffset,
        )}`,
        afterCursor: `Cursor is before this text in "${selectedChapter.title}":\n${chapterContent.slice(cursorOffset)}`,
      };
    }

    return { beforeCursor, afterCursor };
  }

  async function requestAiCompletion() {
    if (!book || !selectedChapter) {
      setAiStatus(t.aiNoChapter);
      return;
    }
    if (!aiSettings.apiKey.trim()) {
      setAiStatus(t.aiMissingKey);
      return;
    }

    const requestId = aiRequestIdRef.current + 1;
    aiRequestIdRef.current = requestId;

    setIsAiBusy(true);
    setAiStatus(t.aiThinking);
    try {
      const chapterContents =
        aiSettings.contextMode === "full" ? await loadAllChapterContent() : allChapterContent;
      const { beforeCursor, afterCursor } = buildAiCompletionContext(chapterContents);
      const suggestion = await invoke<string>("ai_complete", {
        input: {
          provider: aiSettings.provider,
          apiKey: aiSettings.apiKey,
          model: aiSettings.model,
          systemPrompt: aiSettings.systemPrompt,
          userPrompt: aiSettings.userPrompt,
          bookTitle: book.title,
          chapterTitle: selectedChapter.title,
          language: book.language,
          beforeCursor,
          afterCursor,
        },
      });

      if (aiRequestIdRef.current !== requestId) return;
      const normalizedSuggestion = suggestion.trim();
      setAiSuggestion(normalizedSuggestion);
      setAiStatus(normalizedSuggestion ? t.aiReady : t.aiEmpty);
    } catch (error) {
      if (aiRequestIdRef.current !== requestId) return;
      setAiSuggestion("");
      setAiStatus(String(error));
    } finally {
      if (aiRequestIdRef.current === requestId) {
        setIsAiBusy(false);
      }
    }
  }

  async function testAiConnection() {
    if (!aiSettings.apiKey.trim()) {
      setAiStatus(t.aiMissingKey);
      return;
    }

    const requestId = aiRequestIdRef.current + 1;
    aiRequestIdRef.current = requestId;
    setAiSuggestion("");
    setIsAiBusy(true);
    setAiStatus(t.aiTesting);

    try {
      await invoke<string>("ai_complete", {
        input: {
          provider: aiSettings.provider,
          apiKey: aiSettings.apiKey,
          model: aiSettings.model,
          systemPrompt: "You are a connection test assistant. Reply with OK only.",
          userPrompt: "Return OK only if this request works.",
          bookTitle: book?.title ?? "Local Ebook Studio",
          chapterTitle: selectedChapter?.title ?? "Connection test",
          language: book?.language ?? lang,
          beforeCursor: "Connection test.",
          afterCursor: "",
        },
      });

      if (aiRequestIdRef.current !== requestId) return;
      setAiStatus(t.aiTestOk);
    } catch (error) {
      if (aiRequestIdRef.current !== requestId) return;
      setAiStatus(String(error));
    } finally {
      if (aiRequestIdRef.current === requestId) {
        setIsAiBusy(false);
      }
    }
  }

  async function hydrateProject(project: ProjectData) {
    const chapterEntries = await Promise.all(
      project.book.chapters.map(async (chapter) => {
        const content = await invoke<string>("read_text", {
          rootPath: project.root_path,
          relativePath: chapter.path,
        });

        return [chapter.id, content] as const;
      }),
    );
    const chapterContentById = Object.fromEntries(chapterEntries);
    const hydratedBook = {
      ...project.book,
      chapters: project.book.chapters.map((chapter) => ({
        ...chapter,
        wordCount: words(chapterContentById[chapter.id] ?? ""),
      })),
    };

    setProject(project.root_path, hydratedBook);
    setAllChapterContent(chapterContentById);
    await invoke("save_book", { rootPath: project.root_path, book: hydratedBook });
    await loadAssets(project.root_path);
  }

  async function persistBook(nextBook: Book) {
    setBook(nextBook);
    if (rootPath) {
      try {
        await invoke("save_book", { rootPath, book: nextBook });
        setSaveState("saved");
      } catch (error) {
        setSaveState("error");
        setMessage(String(error));
      }
    }
  }

  function updateContent(value: string) {
    if (!book || !selectedChapter) return;
    const updatedChapters = book.chapters.map((chapter) =>
      chapter.id === selectedChapter.id
        ? { ...chapter, wordCount: words(value), updatedAt: nowIso() }
        : chapter,
    );

    const nextBook = { ...book, chapters: updatedChapters };
    setBook(nextBook);
    setChapterContent(value);
    setAllChapterContent({ ...allChapterContent, [selectedChapter.id]: value });
    setAiSuggestion("");
    setSaveState("dirty");
  }

  async function saveNow() {
    if (!rootPath || !book || !selectedChapter) return;

    setSaveState("saving");
    try {
      await invoke("write_text", {
        rootPath,
        relativePath: selectedChapter.path,
        content: chapterContent,
      });
      const latestBook = useEditorStore.getState().book;
      await invoke("save_book", { rootPath, book: latestBook ?? book });
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      setMessage(String(error));
    }
  }

  async function addChapter() {
    if (!rootPath || !book) return;

    const title = window.prompt(t.chapterTitlePrompt, `${t.chapterFallback} ${book.chapters.length + 1}`);
    if (!title) return;

    const order = book.chapters.length + 1;
    const id = `chapter-${Date.now()}`;
    const path = `chapters/${String(order).padStart(2, "0")}-${slugify(title)}.md`;
    const chapter: Chapter = {
      id,
      title,
      path,
      order,
      status: "draft",
      wordCount: 0,
      updatedAt: nowIso(),
    };

    await invoke("write_text", { rootPath, relativePath: path, content: `# ${title}\n\n` });
    await persistBook({ ...book, chapters: [...book.chapters, chapter] });
    setAllChapterContent({ ...allChapterContent, [id]: `# ${title}\n\n` });
    setSelectedChapterId(id);
  }

  function startRenameChapter(chapter: Chapter) {
    setRenamingChapterId(chapter.id);
    setRenamingTitle(chapter.title);
  }

  function cancelRenameChapter() {
    setRenamingChapterId(null);
    setRenamingTitle("");
  }

  async function commitRenameChapter(chapter: Chapter) {
    if (!book) return;
    const trimmedTitle = renamingTitle.trim();
    if (!trimmedTitle || trimmedTitle === chapter.title) return;
    await persistBook({
      ...book,
      chapters: book.chapters.map((item) =>
        item.id === chapter.id ? { ...item, title: trimmedTitle, updatedAt: nowIso() } : item,
      ),
    });
    setMessage(`${t.rename}: ${trimmedTitle}`);
    cancelRenameChapter();
  }

  async function deleteChapter(chapter: Chapter) {
    if (!rootPath || !book || book.chapters.length <= 1) return;
    if (!window.confirm(t.deleteConfirm(chapter.title))) return;

    await invoke("delete_file", { rootPath, relativePath: chapter.path });
    const remaining = book.chapters
      .filter((item) => item.id !== chapter.id)
      .map((item, index) => ({ ...item, order: index + 1 }));
    await persistBook({ ...book, chapters: remaining });
    setSelectedChapterId(remaining[0]?.id ?? null);
  }

  function moveChapter(chapter: Chapter, direction: -1 | 1) {
    if (!book) return;
    const ordered = [...book.chapters].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((item) => item.id === chapter.id);
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;

    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    persistBook({
      ...book,
      chapters: ordered.map((item, itemIndex) => ({ ...item, order: itemIndex + 1 })),
    });
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!rootPath || !selectedChapter) return;

    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) return;

    let insertion = "";
    for (const file of files) {
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
      const assetPath = await invoke<string>("write_asset", { rootPath, fileName: file.name, bytes });
      insertion += `\n![${file.name}](../${assetPath})\n`;
    }

    updateContent(`${chapterContent}${insertion}`);
    await loadAssets();
  }

  async function loadAllChapterContent(): Promise<Record<string, string>> {
    if (!rootPath || !book) return {};

    const next = { ...allChapterContent, [selectedChapterId ?? ""]: chapterContent };
    for (const chapter of book.chapters) {
      if (!next[chapter.id]) {
        next[chapter.id] = await invoke<string>("read_text", { rootPath, relativePath: chapter.path });
      }
    }
    setAllChapterContent(next);
    return next;
  }

  async function exportBook() {
    if (!rootPath || !book) return;

    setIsBusy(true);
    try {
      await saveNow();
      const contents = await loadAllChapterContent();
      const slug = slugify(book.title);
      const markdownOutput = mergeBookMarkdown(book, contents);
      const htmlOutput = await renderBookHtml(book, markdownOutput);
      const printHtml = await renderBookHtml(book, markdownOutput, { print: true });
      const assetPayload = await Promise.all(
        assets.map(async (asset) => ({
          ...asset,
          bytes: await invoke<number[]>("read_binary", { rootPath, relativePath: asset.path }),
        })),
      );
      const epubBytes = await buildEpub(book, contents, assetPayload);

      const markdownPath = await invoke<string>("write_export_text", {
        rootPath,
        fileName: `${slug}.md`,
        content: markdownOutput,
      });
      const htmlPath = await invoke<string>("write_export_text", {
        rootPath,
        fileName: `${slug}.html`,
        content: htmlOutput,
      });
      const printPath = await invoke<string>("write_export_text", {
        rootPath,
        fileName: `${slug}-print.html`,
        content: printHtml,
      });
      const epubPath = await invoke<string>("write_export_binary", {
        rootPath,
        fileName: `${slug}.epub`,
        bytes: Array.from(epubBytes),
      });

      setMessage(t.exported);
      await revealItemInDir([markdownPath, htmlPath, epubPath]);
      await openPath(printPath);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setIsBusy(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveNow();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [rootPath, book, selectedChapter, chapterContent]);

  if (!book || !rootPath) {
    return (
      <main className="start-screen">
        <section className="start-panel">
          <div>
            <p className="eyebrow">{t.eyebrow}</p>
            <h1>{t.title}</h1>
            <p className="start-copy">
              {t.startCopy}
            </p>
          </div>

          <div className="form-grid">
            <label>
              {t.bookTitle}
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </label>
            <label>
              {t.author}
              <input value={form.author} onChange={(event) => setForm({ ...form, author: event.target.value })} />
            </label>
            <label>
              {t.language}
              <select
                value={form.language}
                onChange={(event) => setForm({ ...form, language: event.target.value as NewBookForm["language"] })}
              >
                <option value="en">English (en)</option>
                <option value="ko">Korean (ko)</option>
              </select>
            </label>
            <label>
              {t.description}
              <textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </label>
          </div>

          <div className="start-actions">
            <button onClick={createProject} disabled={isBusy || !form.title || !form.author}>
              {t.newBook}
            </button>
            <button className="secondary" onClick={openProject} disabled={isBusy}>
              {t.openProject}
            </button>
          </div>
          <div className="recent-projects">
            <h2>{t.recentProjects}</h2>
            <p>{t.recentProjectsEmpty}</p>
          </div>
          {message ? <p className="status-message">{message}</p> : null}
        </section>
      </main>
    );
  }

  const orderedChapters = [...book.chapters].sort((a, b) => a.order - b.order);

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <strong>{book.title}</strong>
          <span>{rootPath}</span>
        </div>
        <nav>
          <button onClick={reset}>{t.project}</button>
          <button onClick={saveNow}>{t.save}</button>
          <button onClick={exportBook} disabled={isBusy}>
            {t.export}
          </button>
          <select value={previewMode} onChange={(event) => setPreviewMode(event.target.value as typeof previewMode)}>
            <option value="chapter">{t.currentChapter}</option>
            <option value="book">{t.fullBook}</option>
            <option value="mobile">{t.mobileWidth}</option>
            <option value="a4">{t.a4Width}</option>
          </select>
          <button onClick={() => setPreviewTheme(previewTheme === "light" ? "dark" : "light")}>
            {previewTheme === "light" ? t.light : t.dark}
          </button>
          <span className={`save-state ${saveState}`}>{saveState}</span>
        </nav>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <section>
            <h2>{t.bookInfo}</h2>
            <label>
              {t.bookTitle}
              <input value={book.title} onChange={(event) => persistBook({ ...book, title: event.target.value })} />
            </label>
            <label>
              {t.author}
              <input value={book.author} onChange={(event) => persistBook({ ...book, author: event.target.value })} />
            </label>
            <label>
              {t.language}
              <select
                value={normalizeLanguage(book.language)}
                onChange={(event) => persistBook({ ...book, language: event.target.value as "en" | "ko" })}
              >
                <option value="en">English (en)</option>
                <option value="ko">Korean (ko)</option>
              </select>
            </label>
          </section>

          <section>
            <div className="section-heading">
              <h2>{t.chapters}</h2>
              <button onClick={addChapter}>{t.add}</button>
            </div>
            <ol className="chapter-list">
              {orderedChapters.map((chapter) => (
                <li className={chapter.id === selectedChapterId ? "active" : ""} key={chapter.id}>
                  {renamingChapterId === chapter.id ? (
                    <div className="chapter-rename">
                      <label>
                        {t.renamePrompt}
                        <input
                          autoFocus
                          value={renamingTitle}
                          onChange={(event) => setRenamingTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commitRenameChapter(chapter);
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              cancelRenameChapter();
                            }
                          }}
                        />
                      </label>
                      <div className="chapter-tools">
                        <button onClick={() => commitRenameChapter(chapter)}>{t.renameSave}</button>
                        <button onClick={cancelRenameChapter}>{t.renameCancel}</button>
                      </div>
                    </div>
                  ) : (
                    <button className="chapter-title" onClick={() => setSelectedChapterId(chapter.id)}>
                      <span>{chapter.order}. {chapter.title}</span>
                      <small>{chapter.wordCount} {t.words}</small>
                    </button>
                  )}
                  <div className="chapter-tools">
                    <button title={t.moveUp} onClick={() => moveChapter(chapter, -1)}>↑</button>
                    <button title={t.moveDown} onClick={() => moveChapter(chapter, 1)}>↓</button>
                    <button title={t.rename} onClick={() => startRenameChapter(chapter)}>{t.rename}</button>
                    <button title={t.delete} onClick={() => deleteChapter(chapter)}>{t.delete}</button>
                  </div>
                  <code>{chapter.path}</code>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <div className="section-heading">
              <h2>{t.assets}</h2>
              <button onClick={() => loadAssets()}>{t.refresh}</button>
            </div>
            <ul className="asset-list">
              {assets.map((asset) => (
                <li key={asset.path} className={chapterContent.includes(asset.name) ? "used" : "unused"}>
                  <span>{asset.name}</span>
                  <small>{formatBytes(asset.size)}</small>
                </li>
              ))}
            </ul>
          </section>

          <section className="ai-panel">
            <div className="section-heading">
              <h2>{t.aiAssistant}</h2>
              <label className="inline-toggle">
                <input
                  type="checkbox"
                  checked={aiSettings.enabled}
                  onChange={(event) => updateAiSettings({ enabled: event.target.checked })}
                />
                {t.aiEnabled}
              </label>
            </div>
            <label>
              {t.aiProvider}
              <select
                value={aiSettings.provider}
                onChange={(event) => updateAiSettings({ provider: event.target.value as AiProvider })}
                disabled={!aiSettings.enabled}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Claude</option>
                <option value="gemini">Gemini</option>
              </select>
            </label>
            <label>
              {t.aiModel}
              <select
                value={isCustomAiModel ? "custom" : aiSettings.model}
                onChange={(event) => {
                  const nextModel = event.target.value;
                  updateAiSettings({
                    model: nextModel === "custom" ? "" : nextModel,
                  });
                }}
                disabled={!aiSettings.enabled}
              >
                {selectedProviderModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
                <option value="custom">{t.aiModelCustom}</option>
              </select>
            </label>
            {isCustomAiModel ? (
              <label>
                {t.aiModelCustom}
                <input
                  value={aiSettings.model}
                  placeholder={t.aiModelCustomPlaceholder}
                  onChange={(event) => updateAiSettings({ model: event.target.value })}
                  disabled={!aiSettings.enabled}
                />
              </label>
            ) : null}
            <label>
              {t.aiApiKey}
              <input
                type="password"
                value={aiSettings.apiKey}
                placeholder={t.aiApiKeyPlaceholder}
                onChange={(event) => updateAiSettings({ apiKey: event.target.value })}
                disabled={!aiSettings.enabled}
              />
            </label>
            <label>
              {t.aiContext}
              <select
                value={aiSettings.contextMode}
                onChange={(event) =>
                  updateAiSettings({ contextMode: normalizeAiContextMode(event.target.value) })
                }
                disabled={!aiSettings.enabled}
              >
                <option value="cursor">{t.aiContextCursor}</option>
                <option value="chapter">{t.aiContextChapter}</option>
                <option value="outline">{t.aiContextOutline}</option>
                <option value="full">{t.aiContextFull}</option>
              </select>
            </label>
            <label>
              {t.aiSystemPrompt}
              <textarea
                value={aiSettings.systemPrompt}
                onChange={(event) => updateAiSettings({ systemPrompt: event.target.value })}
                disabled={!aiSettings.enabled}
              />
            </label>
            <label>
              {t.aiUserPrompt}
              <textarea
                value={aiSettings.userPrompt}
                onChange={(event) => updateAiSettings({ userPrompt: event.target.value })}
                disabled={!aiSettings.enabled}
              />
            </label>
            <label className="inline-toggle">
              <input
                type="checkbox"
                checked={aiSettings.autoSuggest}
                onChange={(event) => updateAiSettings({ autoSuggest: event.target.checked })}
                disabled={!aiSettings.enabled}
              />
              {t.aiAutoSuggest}
            </label>
            <div className="ai-actions">
              <button onClick={testAiConnection} disabled={!aiSettings.enabled || isAiBusy}>
                {t.aiTest}
              </button>
              <button onClick={requestAiCompletion} disabled={!aiSettings.enabled || isAiBusy}>
                {isAiBusy ? t.aiThinking : t.aiSuggest}
              </button>
            </div>
            {aiStatus ? <p className="ai-status">{aiStatus}</p> : null}
          </section>
        </aside>

        <section className="editor-pane" onDrop={handleDrop} onDragOver={(event) => event.preventDefault()}>
          <div className="pane-heading">
            <h2>{selectedChapter?.title ?? t.noChapter}</h2>
            <span>{t.dropImages}</span>
          </div>
          <CodeMirror
            ref={editorRef}
            value={chapterContent}
            height="100%"
            extensions={editorExtensions}
            theme={previewTheme === "dark" ? oneDark : undefined}
            onChange={updateContent}
            onUpdate={(viewUpdate) => {
              setCursorOffset(viewUpdate.state.selection.main.head);
            }}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
              autocompletion: true,
            }}
          />
        </section>

        <section className={`preview-pane ${previewMode} ${previewTheme}`}>
          <div className="pane-heading">
            <h2>{t.preview}</h2>
            <span>{previewMode}</span>
          </div>
          <article className="preview-page" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </section>
      </section>

      {message ? <footer className="message-bar">{message}</footer> : null}
    </main>
  );
}

export default App;
