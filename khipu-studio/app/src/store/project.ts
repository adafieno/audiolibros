import { create } from "zustand";

type ProjectState = {
  root: string | null;
  setRoot: (p: string | null) => void;
  reset: () => void;
};

export const useProject = create<ProjectState>()((set) => ({
  root: null,
  setRoot: (p) => set({ root: p }),
  reset: () => set({ root: null }),
}));
