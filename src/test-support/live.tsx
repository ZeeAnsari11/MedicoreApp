/** Shared helpers for the live contract tests (never imported by app code). */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { apiFetch } from '@/api/client';
import { useBranchStore } from '@/store/branch';
import { useSessionStore } from '@/store/session';
import { useToastStore } from '@/store/toast';
import type { AuthResponse, Branch } from '@/types/medicore';

// jest-expo swaps in Expo's fetch, which does not return a real Response under Node; use a minimal http-based fetch.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const http = require('node:http') as typeof import('node:http');
const nodeFetch = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal } = {}) =>
  new Promise<Response>((resolve, reject) => {
    const req = http.request(url, { method: init.method ?? 'GET', headers: init.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const status = res.statusCode ?? 0;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          statusText: res.statusMessage ?? '',
          headers: { get: (k: string) => (res.headers[k.toLowerCase()] as string | undefined) ?? null },
          json: async () => JSON.parse(text),
          text: async () => text,
          arrayBuffer: async () => {
            const buf = Buffer.concat(chunks);
            return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
          },
        } as unknown as Response);
      });
    });
    req.on('error', reject);
    init.signal?.addEventListener('abort', () => req.destroy(new Error('aborted')));
    if (init.body) req.write(init.body);
    req.end();
  });
export const installNodeFetch = () => {
  globalThis.fetch = nodeFetch as unknown as typeof fetch;
};

export const liveWrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return Wrapper;
};

export const toasts = () => useToastStore.getState().toasts.map((t) => t.text);

export const login = async (username: string, password: string) => {
  const res = await apiFetch<AuthResponse>('/auth/login', { method: 'POST', body: { username, password }, auth: false });
  await useSessionStore.getState().setToken(res.accessToken);
  useBranchStore.setState({ selection: null });
  useToastStore.setState({ toasts: [] });
};

export interface LiveTenant {
  suffix: string;
  admin: { username: string; password: string };
  main: Branch;
  north: Branch;
}

/** Creates a fresh tenant with an admin and two branches through the platform admin; leaves the session logged in as the admin. */
export async function createLiveTenant(prefix: string): Promise<LiveTenant> {
  const suffix = `${prefix}${Date.now().toString(36)}`;
  useSessionStore.setState({ hydrated: true, token: null, impersonationToken: null });
  await login(process.env.LIVE_PLATFORM_USER ?? 'platform', process.env.LIVE_PLATFORM_PASSWORD ?? '');
  const tenant = await apiFetch<{ temporaryPassword: string }>('/platform/tenants', {
    method: 'POST',
    body: { tenantName: `Live Pharma ${suffix}`, adminFullName: 'Live Admin', adminUsername: `admin${suffix}` },
  });
  const admin = { username: `admin${suffix}`, password: tenant.temporaryPassword };
  await login(admin.username, admin.password);
  const main = await apiFetch<Branch>('/branches', { method: 'POST', body: { name: 'Main', code: 'MN', isMain: true } });
  const north = await apiFetch<Branch>('/branches', { method: 'POST', body: { name: 'North', code: 'NRT' } });
  return { suffix, admin, main, north };
}

/** Location fields `POST /users` requires (CreateUserDto). */
export const LIVE_LOCATION = { territory: 'Live territory', city: 'Lahore', address: 'Live test street' };

/** A restricted role + a user pinned to `branchId`; returns their credentials. */
export async function createClerk(suffix: string, branchId: string, allowedModules: string[]) {
  const role = await apiFetch<{ id: string }>('/roles', { method: 'POST', body: { name: `Clerk ${suffix}`, allowedModules } });
  const username = `clerk${suffix}`;
  const user = await apiFetch<{ temporaryPassword: string }>('/users', {
    method: 'POST',
    body: { username, fullName: 'Clerk', ...LIVE_LOCATION, tenantRole: 'TENANT_USER', roleId: role.id, branchId },
  });
  return { username, password: user.temporaryPassword };
}
