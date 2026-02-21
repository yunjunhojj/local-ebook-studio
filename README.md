# Local Ebook Studio

Local Ebook Studio is a local-first desktop editor for developer ebooks. It stores each book as a file-based project with `book.json`, Markdown chapters, assets, themes, and exports.

## Stack

- Tauri v2
- React 19
- TypeScript
- Vite
- CodeMirror 6
- Zustand
- unified, remark, and rehype
- JSZip for EPUB packaging

## Development

```bash
pnpm install
pnpm build
pnpm tauri dev
```

Rust is required for Tauri desktop development. Install it with rustup if `cargo` is not available.

## Project Format

```text
my-book/
  book.json
  chapters/
  assets/
    images/
    diagrams/
  themes/
  exports/
```

## MVP Features

- Create and open local ebook projects
- Edit Markdown chapters with CodeMirror
- Manage chapter order, titles, and files
- Autosave chapter content and metadata
- Preview the current chapter or full book
- Drop images into the editor and store them under `assets/images`
- Export merged Markdown, standalone HTML, EPUB 3, and print-ready HTML for PDF output

## Sample

Open `samples/browser-book` from the app to try a small browser-internals ebook project.
