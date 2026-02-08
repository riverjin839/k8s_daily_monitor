import { create } from 'zustand';
import { Playbook } from '@/types';

interface PlaybookState {
  playbooks: Playbook[];
  runningIds: Set<string>;
  setPlaybooks: (playbooks: Playbook[]) => void;
  setRunning: (id: string) => void;
  clearRunning: (id: string) => void;
}

export const usePlaybookStore = create<PlaybookState>((set) => ({
  playbooks: [],
  runningIds: new Set(),

  setPlaybooks: (playbooks) => set({ playbooks }),

  setRunning: (id) =>
    set((state) => ({
      runningIds: new Set([...state.runningIds, id]),
    })),

  clearRunning: (id) =>
    set((state) => {
      const next = new Set(state.runningIds);
      next.delete(id);
      return { runningIds: next };
    }),
}));
