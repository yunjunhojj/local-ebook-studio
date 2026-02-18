# Local Ebook Studio

Local Ebook Studio is a local-first desktop editor for writing and publishing ebooks. It treats an ebook like a project: metadata lives in `book.json`, chapters live as Markdown files, images live under `assets/images`, and generated outputs are written to `exports`.

The app is currently focused on solo authors who want a lightweight local writing tool with chapter management, live preview, basic publishing exports, and optional AI-assisted sentence completion.

## Current Status

This repository contains an MVP desktop app built with Tauri v2, React, TypeScript, Vite, CodeMirror 6, TipTap, and `pnpm`.

Implemented:

- Create a new ebook project from the start screen.
- Open an existing project folder containing `book.json`.
- Restrict project language to English (`en`) or Korean (`ko`).
- Edit book metadata and chapter metadata.
- Add, rename, reorder, and delete chapters.
- Edit chapters in Markdown mode with CodeMirror 6.
- Edit chapters in Visual mode with TipTap.
- Autosave chapter content and `book.json` metadata.
- Show chapter word counts.
- Preview the current chapter, full book, mobile width, or A4/PDF width.
- Toggle light and dark preview themes.
- Render GitHub-flavored Markdown, tables, links, images, and highlighted code blocks.
- Add images through the sidebar picker and copy them into `assets/images`.
- Convert local image paths for Tauri preview rendering.
- List image assets and detect currently unused assets.
- Export merged Markdown, standalone HTML, EPUB 3, and print-optimized HTML.
- Open the print HTML so the user can use the native print/save-as-PDF flow.
- Optional AI assistant with OpenAI, Anthropic, and Gemini providers.
- AI ghost-text completion with `Cmd/Ctrl + Enter` to request, `Tab` to accept, and `Esc` to dismiss.
- AI context modes: cursor nearby, current chapter, book outline plus cursor, or full book.
- AI genre presets for self-help, novel, humanities, essay, business, education, poetry, memoir, technology, and custom genres.
- English and Korean UI copy.

Not implemented yet:

- Direct silent background PDF generation.
- Cloud sync, accounts, collaboration, payments, or plugin marketplace.
- Git UI.
- Production-grade EPUB validation and advanced pagination controls.

## Tech Stack

- Desktop shell: Tauri v2
- Frontend: React 19, TypeScript, Vite
- Package manager: pnpm
- Markdown editor: CodeMirror 6
- Visual editor: TipTap
- State management: Zustand
- Markdown pipeline: unified, remark, rehype, remark-gfm, rehype-highlight
- Syntax highlighting: highlight.js
- EPUB packaging: JSZip
- Native capabilities: Tauri dialog, fs, opener, and asset protocol
- AI requests: Rust/Tauri command using `reqwest`

## Development

Requirements:

- Node.js
- pnpm
- Rust and Cargo
- Tauri system dependencies for your OS

Install dependencies:

```bash
pnpm install
```

Run the web frontend only:

```bash
pnpm dev
```

Run the desktop app in development mode:

```bash
pnpm tauri dev
```

Build the frontend:

```bash
pnpm build
```

Build/package the desktop app:

```bash
pnpm tauri build
```

## Project Format

Each ebook project is a plain local folder:

```text
my-book/
  book.json
  chapters/
    01-introduction.md
  assets/
    images/
    diagrams/
  themes/
    default.css
  exports/
```

`book.json` stores metadata, chapter order, theme configuration, and export settings. Chapter content is stored as Markdown files so the project remains easy to inspect, back up, and version with Git.

Example language values are intentionally limited to:

```json
{
  "language": "en"
}
```

or:

```json
{
  "language": "ko"
}
```

## Editing Workflow

1. Create a new book or open an existing project folder.
2. Use the left sidebar to edit book info, manage chapters, add images, and configure AI assistance.
3. Write in Markdown mode or switch to Visual mode.
4. Use the preview pane to inspect the current chapter, the full book, mobile layout, or A4/PDF layout.
5. Click Export to generate:
   - `exports/{slug}.md`
   - `exports/{slug}.html`
   - `exports/{slug}.epub`
   - `exports/{slug}-print.html`

The print HTML is opened after export so the operating system/browser print dialog can be used for PDF output.

## AI Assistant

The AI assistant is optional and disabled until enabled in the sidebar. API keys are entered locally in the app settings panel and are not committed to the repository.

Supported providers:

- OpenAI
- Anthropic
- Gemini

Useful shortcuts:

- Generate suggestion: `Cmd/Ctrl + Enter`
- Accept ghost text: `Tab`
- Dismiss suggestion: `Esc`

The completion request includes the cursor position and separates text before and after the cursor. The amount of broader book context depends on the selected context mode.

## Assets

Images are added through the Assets section in the sidebar. Selected files are copied into:

```text
assets/images/
```

The editor inserts a relative Markdown image path into the active chapter. The preview converts that relative path into a Tauri asset URL so local images render correctly in the desktop webview.

Drag-and-drop image insertion has been removed to keep image handling explicit and predictable.

## Sample Project

Open this folder from the app to try a small browser-internals ebook project:

```text
samples/browser-book
```

## Repository Notes

The app is English-first in source code, commit messages, project metadata, and documentation. Korean is supported as an app language and book language option.
