import { create } from "zustand";

const TARGET_PATH_KEY = "atlas-composer-target-path";

function getSavedTargetPath(): string {
  try {
    return localStorage.getItem(TARGET_PATH_KEY) ?? "";
  } catch {
    return "";
  }
}

interface AtlasComposerState {
  step: number;
  setStep: (step: number) => void;

  selectedFeatures: string[];
  toggleFeature: (id: string) => void;
  setSelectedFeatures: (ids: string[]) => void;

  projectName: string;
  setProjectName: (name: string) => void;
  targetPath: string;
  setTargetPath: (path: string) => void;

  reset: () => void;
}

export const useAtlasComposerStore = create<AtlasComposerState>((set) => ({
  step: 0,
  setStep: (step) => set({ step }),

  selectedFeatures: [],
  toggleFeature: (id) =>
    set((s) => ({
      selectedFeatures: s.selectedFeatures.includes(id)
        ? s.selectedFeatures.filter((f) => f !== id)
        : [...s.selectedFeatures, id],
    })),
  setSelectedFeatures: (ids) => set({ selectedFeatures: ids }),

  projectName: "",
  setProjectName: (projectName) => set({ projectName }),
  targetPath: getSavedTargetPath(),
  setTargetPath: (targetPath) => {
    try {
      localStorage.setItem(TARGET_PATH_KEY, targetPath);
    } catch {
      // ignore
    }
    return set({ targetPath });
  },

  reset: () =>
    set({
      step: 0,
      selectedFeatures: [],
      projectName: "",
      targetPath: getSavedTargetPath(),
    }),
}));
