import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { SaleForm } from '@/features/sales/sale-form';
import { useBranchStore } from '@/store/branch';
import { useSessionStore } from '@/store/session';
import { TenantRole } from '@/types/medicore';

// babel-jest hoists this above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.setTimeout(20000);

let me: Record<string, unknown>;
const branches = [{ id: 'b1', name: 'Main', code: 'M', isMain: true, isActive: true }, { id: 'b2', name: 'North', code: 'N', isMain: false, isActive: true }];

beforeEach(() => {
  useSessionStore.setState({ hydrated: true, token: 'tok', impersonationToken: null });
  useBranchStore.setState({ selection: null });
  global.fetch = jest.fn(async (url: string) => {
    const path = url.replace('http://api.test/api', '').split('?')[0];
    const body = path === '/auth/me' ? me : path === '/branches' ? branches : [];
    return { ok: true, status: 200, statusText: 'OK', json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
});

const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}>{ui}</QueryClientProvider>);

describe('SaleForm', () => {
  it('cannot place a sale with no lines', async () => {
    me = { userId: 'u1', tenantId: 't1', username: 'admin', tenantRole: TenantRole.TENANT_SUPER_ADMIN, permissions: [] };
    await wrap(<SaleForm />);
    expect(await screen.findByText('No lines yet.')).toBeTruthy();
    const button = screen.getByText('Place sale');
    expect(button).toBeTruthy();
    expect(screen.getByText('Estimated total')).toBeTruthy();
  });

  it('pins a branch user to their own branch and locks discount without sales:discount', async () => {
    me = { userId: 'u2', tenantId: 't1', username: 'clerk', tenantRole: TenantRole.TENANT_USER, branchId: 'b2', permissions: ['sales:create', 'sales:read'] };
    await wrap(<SaleForm />);
    await waitFor(() => expect(screen.getByLabelText('Branch').props.value).toBe('North'));
    expect(screen.getByLabelText('Branch').props.editable).toBe(false);
    expect(screen.getByLabelText('Discount %').props.editable).toBe(false);
    expect(screen.queryByText('Create new customer')).toBeNull();
  });
});
