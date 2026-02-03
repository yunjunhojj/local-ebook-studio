import { create } from "zustand";
import type { AssetEntry, Book, PreviewMode, PreviewTheme, SaveState } from "./types";

type EditorStore = {
  rootPath: string | null;
  book: Book | null;
  selectedChapterId: string | null;
  chapterContent: string;
  allChapterContent: Record<string, string>;
  assets: AssetEntry[];
  previewMode: PreviewMode;
  previewTheme: PreviewTheme;
  saveState: SaveState;
  message: string;
  setProject: (rootPath: string, book: Book) => void;
  setBook: (book: Book) => void;
  setSelectedChapterId: (id: string | null) => void;
  setChapterContent: (content: string) => void;
  setAllChapterContent: (content: Record<string, string>) => void;
  setAssets: (assets: AssetEntry[]) => void;
  setPreviewMode: (mode: PreviewMode) => void;
  setPreviewTheme: (theme: PreviewTheme) => void;
  setSaveState: (state: SaveState) => void;
  setMessage: (message: string) => void;
  reset: () => void;
};

const initial = {
  rootPath: null,
  book: null,
  selectedChapterId: null,
  chapterContent: "",
  allChapterContent: {},
  assets: [],
  previewMode: "chapter" as PreviewMode,
  previewTheme: "light" as PreviewTheme,
  saveState: "saved" as SaveState,
  message: "",
};

export const useEditorStore = create<EditorStore>((set) => ({
  ...initial,
  setProject: (rootPath, book) =>
    set({
      rootPath,
      book,
      selectedChapterId: book.chapters[0]?.id ?? null,
      chapterContent: "",
      allChapterContent: {},
      saveState: "saved",
      message: `Opened ${book.title}`,
    }),
  setBook: (book) => set({ book }),
  setSelectedChapterId: (id) => set({ selectedChapterId: id }),
  setChapterContent: (content) => set({ chapterContent: content }),
  setAllChapterContent: (content) => set({ allChapterContent: content }),
  setAssets: (assets) => set({ assets }),
  setPreviewMode: (mode) => set({ previewMode: mode }),
  setPreviewTheme: (theme) => set({ previewTheme: theme }),
  setSaveState: (state) => set({ saveState: state }),
  setMessage: (message) => set({ message }),
  reset: () => set(initial),
}));
