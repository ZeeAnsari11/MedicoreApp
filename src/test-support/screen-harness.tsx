/**
 * Shared mocked-fetch harness for accounting screen tests (same pattern as the Purchases / Cash Receipt suites).
 * Usage: `const h = createHarness(); beforeEach(h.reset); afterEach(h.settle);` then set `h.routes['GET /path'] = ...`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { useBranchStore } from '@/store/branch';
import { useSessionStore } from '@/store/session';
import { useToastStore } from '@/store/toast';
import { TenantRole } from '@/types/medicore';

export interface Call { method: string; path: string; body: unknown; headers: Record<string, string> }
export type Handler = (call: Call) => { status?: number; body?: unknown; gate?: Promise<void> };

export const branches = [{ id: 'b1', name: 'Main', code: 'M', isMain: true, isActive: true }, { id: 'b2', name: 'North', code: 'N', isMain: false, isActive: true }];
export const makeUser = (permissions: string[], extra: Record<string, unknown> = {}) => ({ userId: 'u1', tenantId: 't1', username: 'acct', tenantRole: TenantRole.TENANT_USER, branchId: 'b1', permissions, ...extra });

export function createHarness() {
  const h = {
    calls: [] as Call[],
    routes: {} as Record<string, Handler>,
    me: makeUser([]) as Record<string, unknown>,
    inFlight: 0,
    reset() {
      h.calls.length = 0;
      h.inFlight = 0;
      h.routes = { 'GET /auth/me': () => ({ body: h.me }), 'GET /branches': () => ({ body: branches }) };
      useSessionStore.setState({ hydrated: true, token: 'tok', impersonationToken: null });
      useBranchStore.setState({ selection: null });
      useToastStore.setState({ toasts: [] });
      global.fetch = jest.fn(async (url: string, init: RequestInit) => {
        const path = url.replace('http://api.test/api', '');
        const call: Call = { method: init.method ?? 'GET', path, body: init.body ? JSON.parse(init.body as string) : undefined, headers: (init.headers ?? {}) as Record<string, string> };
        h.calls.push(call);
        h.inFlight += 1;
        const handler = h.routes[`${call.method} ${path.split('?')[0]}`];
        const { status = 200, body, gate } = handler ? handler(call) : { status: 404, body: { message: 'no route' }, gate: undefined };
        if (gate) await gate;
        h.inFlight -= 1;
        return { ok: status < 400, status, statusText: 'x', json: async () => body } as unknown as Response;
      }) as unknown as typeof fetch;
    },
    /** Let every request settle (and React Query's notifications flush) before unmounting, so nothing leaks into the next test. */
    async settle() {
      await waitFor(() => expect(h.inFlight).toBe(0));
      await new Promise((r) => setTimeout(r, 20));
      cleanup();
    },
    wrap: (ui: ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } })}>{ui}</QueryClientProvider>),
    callsTo: (method: string, path: string) => h.calls.filter((c) => c.method === method && c.path.split('?')[0] === path),
    toastTexts: () => useToastStore.getState().toasts.map((t) => t.text),
  };
  return h;
}

export const disabled = (el: { props: { accessibilityState?: { disabled?: boolean } } }) => !!el.props.accessibilityState?.disabled;
