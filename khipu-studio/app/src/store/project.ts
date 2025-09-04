import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ProjectState = {
  root: string | null;
  setRoot: (p: string | null) => void;
};

export const useProject = create<ProjectState>()(
  persist(
    (set) => ({ root: null, setRoot: (p) => set({ root: p }) }),
    { name: 'khipu:project' }
  )
);
