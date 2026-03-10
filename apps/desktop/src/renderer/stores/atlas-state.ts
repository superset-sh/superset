import { create } from "zustand";

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
  targetPath: "",
  setTargetPath: (targetPath) => set({ targetPath }),

  reset: () =>
    set({
      step: 0,
      selectedFeatures: [],
      projectName: "",
      targetPath: "",
    }),
}));
