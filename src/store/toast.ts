import { create } from 'zustand';

export interface ToastMessage {
  id: number;
  kind: 'success' | 'error';
  text: string;
}

interface ToastState {
  toasts: ToastMessage[];
  show: (kind: ToastMessage['kind'], text: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (kind, text) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, kind, text }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 5000 : 2500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (text: string) => useToastStore.getState().show('success', text),
  error: (text: string) => useToastStore.getState().show('error', text),
};
