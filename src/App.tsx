import { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
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

const defaultForm: NewBookForm = {
  title: "Building a Browser from Scratch",
  author: "Local Ebook Studio Author",
  language: "en",
  description: "A practical ebook about browser internals, parsing, layout, and painting.",
};

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
    noChapter: "No chapter selected",
    dropImages: "Drop images here to copy them into assets/images.",
    preview: "Preview",
    chapterTitlePrompt: "Chapter title",
    chapterFallback: "Chapter",
    renamePrompt: "Rename chapter",
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
    noChapter: "선택한 챕터 없음",
    dropImages: "이미지를 여기에 놓으면 assets/images로 복사됩니다.",
    preview: "미리보기",
    chapterTitlePrompt: "챕터 제목",
    chapterFallback: "챕터",
    renamePrompt: "챕터 이름 변경",
    deleteConfirm: (title: string) => `"${title}" 챕터를 삭제할까요? 챕터 파일도 삭제됩니다.`,
    exported: "Markdown, HTML, EPUB, 인쇄용 HTML을 내보냈습니다.",
  },
};

function normalizeLanguage(language?: string): "en" | "ko" {
  return language === "ko" ? "ko" : "en";
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
  const lang = normalizeLanguage(book?.language ?? form.language);
  const t = copy[lang];

  const selectedChapter = useMemo(
    () => book?.chapters.find((chapter) => chapter.id === selectedChapterId) ?? null,
    [book, selectedChapterId],
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
      setProject(project.root_path, project.book);
      await loadAssets(project.root_path);
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
      setProject(project.root_path, project.book);
      await loadAssets(project.root_path);
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

  async function renameChapter(chapter: Chapter) {
    if (!book) return;
    const title = window.prompt(t.renamePrompt, chapter.title);
    const trimmedTitle = title?.trim();
    if (!trimmedTitle || trimmedTitle === chapter.title) return;
    await persistBook({
      ...book,
      chapters: book.chapters.map((item) =>
        item.id === chapter.id ? { ...item, title: trimmedTitle, updatedAt: nowIso() } : item,
      ),
    });
    setMessage(`${t.rename}: ${trimmedTitle}`);
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
                  <button className="chapter-title" onClick={() => setSelectedChapterId(chapter.id)}>
                    <span>{chapter.order}. {chapter.title}</span>
                    <small>{chapter.wordCount} {t.words}</small>
                  </button>
                  <div className="chapter-tools">
                    <button title={t.moveUp} onClick={() => moveChapter(chapter, -1)}>↑</button>
                    <button title={t.moveDown} onClick={() => moveChapter(chapter, 1)}>↓</button>
                    <button title={t.rename} onClick={() => renameChapter(chapter)}>{t.rename}</button>
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
        </aside>

        <section className="editor-pane" onDrop={handleDrop} onDragOver={(event) => event.preventDefault()}>
          <div className="pane-heading">
            <h2>{selectedChapter?.title ?? t.noChapter}</h2>
            <span>{t.dropImages}</span>
          </div>
          <CodeMirror
            value={chapterContent}
            height="100%"
            extensions={[markdown()]}
            theme={previewTheme === "dark" ? oneDark : undefined}
            onChange={updateContent}
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
