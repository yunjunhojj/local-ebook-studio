import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import type { Book } from "../types";

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeSlug)
  .use(rehypeAutolinkHeadings, { behavior: "wrap" })
  .use(rehypeHighlight)
  .use(rehypeStringify, { allowDangerousHtml: true });

export async function markdownToHtml(markdown: string): Promise<string> {
  const result = await processor.process(markdown);
  return String(result);
}

export function mergeBookMarkdown(book: Book, chapterContent: Record<string, string>): string {
  const frontMatter = [
    `# ${book.title}`,
    book.subtitle ? `_${book.subtitle}_` : "",
    `Author: ${book.author}`,
    book.description ? `\n${book.description}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const chapters = [...book.chapters]
    .sort((a, b) => a.order - b.order)
    .map((chapter) => chapterContent[chapter.id] ?? "")
    .join("\n\n---\n\n");

  return `${frontMatter}\n\n---\n\n${chapters}\n`;
}

export async function renderBookHtml(book: Book, markdown: string, options?: { print?: boolean }) {
  const body = await markdownToHtml(markdown);
  const toc = [...book.chapters]
    .sort((a, b) => a.order - b.order)
    .map((chapter) => `<li><a href="#${chapter.id}">${escapeHtml(chapter.title)}</a></li>`)
    .join("");

  return `<!doctype html>
<html lang="${escapeHtml(book.language || "en")}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(book.title)}</title>
  <style>${exportCss(options?.print)}</style>
</head>
<body>
  <main class="book">
    <header class="book-cover">
      <p class="eyebrow">Local Ebook Studio Export</p>
      <h1>${escapeHtml(book.title)}</h1>
      ${book.subtitle ? `<p class="subtitle">${escapeHtml(book.subtitle)}</p>` : ""}
      <p class="author">${escapeHtml(book.author)}</p>
      ${book.description ? `<p class="description">${escapeHtml(book.description)}</p>` : ""}
    </header>
    ${book.exportConfig.includeToc ? `<nav class="toc"><h2>Contents</h2><ol>${toc}</ol></nav>` : ""}
    <article>${body}</article>
  </main>
</body>
</html>`;
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function exportCss(print = false): string {
  return `
    :root { color: #1f2937; background: #f8fafc; }
    body { margin: 0; font: 16px/1.65 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .book { max-width: ${print ? "760px" : "860px"}; margin: 0 auto; padding: 48px 32px; background: #fff; min-height: 100vh; }
    .book-cover { border-bottom: 1px solid #d8dee9; margin-bottom: 32px; padding-bottom: 32px; }
    .eyebrow { color: #64748b; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    h1, h2, h3 { line-height: 1.2; color: #111827; }
    h1 { font-size: 38px; }
    h2 { margin-top: 36px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
    a { color: #0f766e; }
    img { max-width: 100%; height: auto; }
    pre { overflow: auto; padding: 16px; border-radius: 8px; background: #111827; color: #f8fafc; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .92em; }
    table { width: 100%; border-collapse: collapse; margin: 24px 0; }
    th, td { border: 1px solid #d8dee9; padding: 8px 10px; text-align: left; }
    blockquote { border-left: 4px solid #0f766e; margin-left: 0; padding-left: 16px; color: #475569; }
    .toc { margin: 32px 0; padding: 20px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; }
    ${print ? "@page { size: A4; margin: 18mm; } body { background: #fff; } .book { padding: 0; }" : ""}
  `;
}
