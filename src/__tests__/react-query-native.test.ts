import NetInfo from '@react-native-community/netinfo';
import { focusManager, MutationObserver, onlineManager } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

import { queryClient } from '@/lib/query-client';
import { setupReactQueryNative } from '@/lib/react-query-native';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock.js'));

describe('setupReactQueryNative', () => {
  let appStateListener: (state: AppStateStatus) => void;
  let netListener: (state: { isConnected: boolean | null }) => void;
  const remove = jest.fn();

  beforeAll(() => {
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener as typeof appStateListener;
      return { remove } as never;
    });
    (NetInfo.addEventListener as jest.Mock).mockImplementation((listener) => {
      netListener = listener;
      return jest.fn();
    });
    setupReactQueryNative();
  });

  it('app foreground/background drives React Query focus', () => {
    appStateListener('background');
    expect(focusManager.isFocused()).toBe(false);
    appStateListener('active');
    expect(focusManager.isFocused()).toBe(true);
  });

  it('NetInfo connectivity drives React Query online state', () => {
    netListener({ isConnected: false });
    expect(onlineManager.isOnline()).toBe(false);
    netListener({ isConnected: true });
    expect(onlineManager.isOnline()).toBe(true);
  });

  it('refetches stale queries when the app returns to the foreground', () => {
    expect(queryClient.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(true);
  });

  it('an offline write is sent (and fails) immediately instead of being queued for later', async () => {
    netListener({ isConnected: false });
    const send = jest.fn().mockRejectedValue(new Error('offline'));
    const observer = new MutationObserver<unknown, Error, void>(queryClient, { mutationFn: send });
    await expect(observer.mutate()).rejects.toThrow('offline');
    expect(send).toHaveBeenCalledTimes(1);
    netListener({ isConnected: true });
  });
});
