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
  language: string;
  description: string;
};

const defaultForm: NewBookForm = {
  title: "Building a Browser from Scratch",
  author: "Local Ebook Studio Author",
  language: "en",
  description: "A practical ebook about browser internals, parsing, layout, and painting.",
};

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
        await invoke("save_book", { rootPath, book });
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
      title: "Choose where to create the book project",
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
      title: "Choose a book project folder",
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

  function updateBook(nextBook: Book) {
    setBook(nextBook);
    if (rootPath) {
      invoke("save_book", { rootPath, book: nextBook }).catch((error) => setMessage(String(error)));
    }
  }

  function updateContent(value: string) {
    if (!book || !selectedChapter) return;
    const updatedChapters = book.chapters.map((chapter) =>
      chapter.id === selectedChapter.id
        ? { ...chapter, wordCount: words(value), updatedAt: nowIso() }
        : chapter,
    );

    setBook({ ...book, chapters: updatedChapters });
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
      await invoke("save_book", { rootPath, book });
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      setMessage(String(error));
    }
  }

  async function addChapter() {
    if (!rootPath || !book) return;

    const title = window.prompt("Chapter title", `Chapter ${book.chapters.length + 1}`);
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
    updateBook({ ...book, chapters: [...book.chapters, chapter] });
    setAllChapterContent({ ...allChapterContent, [id]: `# ${title}\n\n` });
    setSelectedChapterId(id);
  }

  function renameChapter(chapter: Chapter) {
    if (!book) return;
    const title = window.prompt("Rename chapter", chapter.title);
    if (!title) return;
    updateBook({
      ...book,
      chapters: book.chapters.map((item) => (item.id === chapter.id ? { ...item, title } : item)),
    });
  }

  async function deleteChapter(chapter: Chapter) {
    if (!rootPath || !book || book.chapters.length <= 1) return;
    if (!window.confirm(`Delete "${chapter.title}"? This removes the chapter file.`)) return;

    await invoke("delete_file", { rootPath, relativePath: chapter.path });
    const remaining = book.chapters
      .filter((item) => item.id !== chapter.id)
      .map((item, index) => ({ ...item, order: index + 1 }));
    updateBook({ ...book, chapters: remaining });
    setSelectedChapterId(remaining[0]?.id ?? null);
  }

  function moveChapter(chapter: Chapter, direction: -1 | 1) {
    if (!book) return;
    const ordered = [...book.chapters].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((item) => item.id === chapter.id);
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;

    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    updateBook({
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

      setMessage(`Exported Markdown, HTML, EPUB, and print HTML.`);
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
            <p className="eyebrow">Local-first publishing</p>
            <h1>Local Ebook Studio</h1>
            <p className="start-copy">
              Write developer ebooks as structured Markdown projects with chapter previews and export-ready output.
            </p>
          </div>

          <div className="form-grid">
            <label>
              Book title
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </label>
            <label>
              Author
              <input value={form.author} onChange={(event) => setForm({ ...form, author: event.target.value })} />
            </label>
            <label>
              Language
              <input
                value={form.language}
                onChange={(event) => setForm({ ...form, language: event.target.value })}
              />
            </label>
            <label>
              Description
              <textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </label>
          </div>

          <div className="start-actions">
            <button onClick={createProject} disabled={isBusy || !form.title || !form.author}>
              New Book
            </button>
            <button className="secondary" onClick={openProject} disabled={isBusy}>
              Open Project
            </button>
          </div>
          <div className="recent-projects">
            <h2>Recent projects</h2>
            <p>Recent project tracking will appear here after the editor is used.</p>
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
          <button onClick={reset}>Project</button>
          <button onClick={saveNow}>Save</button>
          <button onClick={exportBook} disabled={isBusy}>
            Export
          </button>
          <select value={previewMode} onChange={(event) => setPreviewMode(event.target.value as typeof previewMode)}>
            <option value="chapter">Current chapter</option>
            <option value="book">Full book</option>
            <option value="mobile">Mobile width</option>
            <option value="a4">A4 width</option>
          </select>
          <button onClick={() => setPreviewTheme(previewTheme === "light" ? "dark" : "light")}>
            {previewTheme === "light" ? "Light" : "Dark"}
          </button>
          <span className={`save-state ${saveState}`}>{saveState}</span>
        </nav>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <section>
            <h2>Book Info</h2>
            <label>
              Title
              <input value={book.title} onChange={(event) => updateBook({ ...book, title: event.target.value })} />
            </label>
            <label>
              Author
              <input value={book.author} onChange={(event) => updateBook({ ...book, author: event.target.value })} />
            </label>
          </section>

          <section>
            <div className="section-heading">
              <h2>Chapters</h2>
              <button onClick={addChapter}>Add</button>
            </div>
            <ol className="chapter-list">
              {orderedChapters.map((chapter) => (
                <li className={chapter.id === selectedChapterId ? "active" : ""} key={chapter.id}>
                  <button className="chapter-title" onClick={() => setSelectedChapterId(chapter.id)}>
                    <span>{chapter.order}. {chapter.title}</span>
                    <small>{chapter.wordCount} words</small>
                  </button>
                  <div className="chapter-tools">
                    <button title="Move up" onClick={() => moveChapter(chapter, -1)}>↑</button>
                    <button title="Move down" onClick={() => moveChapter(chapter, 1)}>↓</button>
                    <button title="Rename" onClick={() => renameChapter(chapter)}>Edit</button>
                    <button title="Delete" onClick={() => deleteChapter(chapter)}>Delete</button>
                  </div>
                  <code>{chapter.path}</code>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <div className="section-heading">
              <h2>Assets</h2>
              <button onClick={() => loadAssets()}>Refresh</button>
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
            <h2>{selectedChapter?.title ?? "No chapter selected"}</h2>
            <span>Drop images here to copy them into assets/images.</span>
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
            <h2>Preview</h2>
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
