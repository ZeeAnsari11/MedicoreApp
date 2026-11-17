import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const TOKEN_KEY = 'medicore_access_token';
// Impersonation tokens stay in memory only: a restart returns to the super admin's own (SecureStore) session.
interface SessionState {
  hydrated: boolean;
  token: string | null;
  impersonationToken: string | null;
  hydrate: () => Promise<void>;
  setToken: (token: string) => Promise<void>;
  setImpersonationToken: (token: string | null) => void;
  clear: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set) => ({
  hydrated: false,
  token: null,
  impersonationToken: null,
  hydrate: async () => {
    let token: string | null = null;
    try {
      token = await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      // Keystore unavailable or corrupted: treat as signed out.
    }
    set({ token, hydrated: true });
  },
  setToken: async (token) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    set({ token });
  },
  setImpersonationToken: (impersonationToken) => set({ impersonationToken }),
  clear: async () => {
    set({ token: null, impersonationToken: null });
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {
      // Already cleared in memory; nothing sensitive left to leak.
    }
  },
}));

/** The token API calls should use: an active impersonation wins over the stored session. */
export const getActiveToken = (): string | null => {
  const { impersonationToken, token } = useSessionStore.getState();
  return impersonationToken ?? token;
};
