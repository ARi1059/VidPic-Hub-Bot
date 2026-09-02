import { create } from "zustand";

interface AppState {
  readingMode: "continuous" | "paged";
  pageLayout: "single" | "double";
  readingDirection: "ltr" | "rtl";
  readerControlsVisible: boolean;
  setReadingMode(readingMode: AppState["readingMode"]): void;
  setPageLayout(pageLayout: AppState["pageLayout"]): void;
  setReadingDirection(readingDirection: AppState["readingDirection"]): void;
  setReaderControlsVisible(visible: boolean): void;
}

export const useAppStore = create<AppState>((set) => ({
  readingMode: "continuous",
  pageLayout: "single",
  readingDirection: "ltr",
  readerControlsVisible: true,
  setReadingMode: (readingMode) => set({ readingMode }),
  setPageLayout: (pageLayout) => set({ pageLayout }),
  setReadingDirection: (readingDirection) => set({ readingDirection }),
  setReaderControlsVisible: (readerControlsVisible) => set({ readerControlsVisible }),
}));
