import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

/**
 * React Query only knows about browser focus/online events. On a phone, "focus" is the app returning to the foreground
 * and "online" comes from NetInfo, so stale screens refetch after sleep and after the connection comes back.
 * Called once from the root layout (kept out of `query-client.ts`, which tests import).
 */
export function setupReactQueryNative() {
  if (Platform.OS !== 'web') {
    focusManager.setEventListener((setFocused) => {
      const sub = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
      return () => sub.remove();
    });
  }
  onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((state) => setOnline(!!state.isConnected)));
}
