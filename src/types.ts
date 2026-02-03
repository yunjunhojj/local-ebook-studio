export type ChapterStatus = "draft" | "review" | "done";

export type Chapter = {
  id: string;
  title: string;
  path: string;
  order: number;
  status: ChapterStatus;
  wordCount: number;
  updatedAt: string;
};

export type ThemeConfig = {
  fontFamily: string;
  codeTheme: string;
  pageWidth: number;
  lineHeight: number;
  headingStyle: "default" | "numbered" | "minimal";
};

export type ExportConfig = {
  formats: Array<"markdown" | "html" | "epub" | "pdf">;
  includeToc: boolean;
  includeCover: boolean;
  outputDir: string;
};

export type Book = {
  id: string;
  title: string;
  subtitle?: string;
  author: string;
  language: string;
  description?: string;
  coverImage?: string;
  chapters: Chapter[];
  theme: ThemeConfig;
  exportConfig: ExportConfig;
};

export type ProjectData = {
  root_path: string;
  book: Book;
};

export type AssetEntry = {
  name: string;
  path: string;
  size: number;
};

export type PreviewMode = "chapter" | "book" | "mobile" | "a4";
export type PreviewTheme = "light" | "dark";

export type SaveState = "saved" | "saving" | "dirty" | "error";
