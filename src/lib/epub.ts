import JSZip from "jszip";
import type { AssetEntry, Book } from "../types";
import { escapeHtml, markdownToHtml } from "./markdown";
import { slugify } from "./strings";

type AssetPayload = AssetEntry & { bytes: number[] };

export async function buildEpub(
  book: Book,
  chapterContent: Record<string, string>,
  assets: AssetPayload[] = [],
): Promise<Uint8Array> {
  const zip = new JSZip();
  const ordered = [...book.chapters].sort((a, b) => a.order - b.order);

  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  zip.file("EPUB/styles/book.css", epubCss());
  zip.file("EPUB/nav.xhtml", navDocument(book));
  for (const asset of assets) {
    zip.file(`EPUB/${asset.path}`, new Uint8Array(asset.bytes));
  }

  for (const chapter of ordered) {
    const html = await markdownToHtml(chapterContent[chapter.id] ?? "");
    zip.file(
      `EPUB/chapters/${chapter.id}.xhtml`,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="${escapeHtml(book.language || "en")}">
<head>
  <title>${escapeHtml(chapter.title)}</title>
  <link rel="stylesheet" href="../styles/book.css" />
</head>
<body>
  <section id="${chapter.id}">
    ${html}
  </section>
</body>
</html>`,
    );
  }

  zip.file("EPUB/package.opf", packageDocument(book));
  return zip.generateAsync({ type: "uint8array", mimeType: "application/epub+zip" });
}

function navDocument(book: Book): string {
  const items = [...book.chapters]
    .sort((a, b) => a.order - b.order)
    .map((chapter) => `<li><a href="chapters/${chapter.id}.xhtml">${escapeHtml(chapter.title)}</a></li>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeHtml(
    book.language || "en",
  )}">
<head>
  <title>Contents</title>
  <link rel="stylesheet" href="styles/book.css" />
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>${items}</ol>
  </nav>
</body>
</html>`;
}

function packageDocument(book: Book): string {
  const ordered = [...book.chapters].sort((a, b) => a.order - b.order);
  const manifestItems = ordered
    .map(
      (chapter) =>
        `<item id="${chapter.id}" href="chapters/${chapter.id}.xhtml" media-type="application/xhtml+xml"/>`,
    )
    .join("\n    ");
  const spineItems = ordered.map((chapter) => `<itemref idref="${chapter.id}"/>`).join("\n    ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:${slugify(book.id || book.title)}</dc:identifier>
    <dc:title>${escapeHtml(book.title)}</dc:title>
    <dc:creator>${escapeHtml(book.author)}</dc:creator>
    <dc:language>${escapeHtml(book.language || "en")}</dc:language>
    ${book.description ? `<dc:description>${escapeHtml(book.description)}</dc:description>` : ""}
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="styles/book.css" media-type="text/css"/>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`;
}

function epubCss(): string {
  return `
    body { font-family: serif; line-height: 1.65; color: #1f2937; }
    h1, h2, h3 { line-height: 1.2; }
    pre { padding: 1em; overflow: auto; background: #111827; color: #f8fafc; }
    code { font-family: monospace; }
    img { max-width: 100%; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #d8dee9; padding: .4em; }
  `;
}
