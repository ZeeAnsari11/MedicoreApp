import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ManufacturerForm } from '@/features/manufacturers/manufacturer-form';
import { ProductForm } from '@/features/products/product-form';
import { VendorForm } from '@/features/vendors/vendor-form';
import { useBranchStore } from '@/store/branch';
import { useSessionStore } from '@/store/session';
import { TenantRole, ProductStatus } from '@/types/medicore';
import type { Product } from '@/types/medicore';

// babel-jest hoists this above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));

jest.setTimeout(20000);

let me: Record<string, unknown>;
const branches = [{ id: 'b1', name: 'Main', code: 'M', isMain: true, isActive: true }, { id: 'b2', name: 'North', code: 'N', isMain: false, isActive: true }];

beforeEach(() => {
  me = { userId: 'u1', tenantId: 't1', username: 'admin', tenantRole: TenantRole.TENANT_SUPER_ADMIN, permissions: [] };
  useSessionStore.setState({ hydrated: true, token: 'tok', impersonationToken: null });
  useBranchStore.setState({ selection: null });
  global.fetch = jest.fn(async (url: string) => {
    const path = url.replace('http://api.test/api', '').split('?')[0];
    const body = path === '/auth/me' ? me : path === '/branches' ? branches : path === '/manufacturers' ? [{ id: 'm1', name: 'GSK', isActive: true }] : [];
    return { ok: true, status: 200, statusText: 'OK', json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
});

const wrap = (ui: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

describe('ManufacturerForm', () => {
  it('blocks an empty submit with field errors, then submits trimmed values with the vendor flag', async () => {
    const onSubmit = jest.fn(async () => undefined);
    await wrap(<ManufacturerForm mode="create" canCreateVendor onSubmit={onSubmit} />);
    await fireEvent.press(await screen.findByText('Save'));
    expect(await screen.findByText('Name must be at least 2 characters')).toBeTruthy();
    expect(await screen.findByText('Branch is required')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Name'), '  GSK ');
    // multi-branch admin: branch must be chosen explicitly (never prefilled from the viewing filter)
    await fireEvent.press(await screen.findByLabelText('Branch'));
    await fireEvent.press(await screen.findByText('North'));
    await fireEvent.press(screen.getByText('Save as Manufacturer + Vendor'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'GSK', branchId: 'b2' }), true);
  });

  it('hides the vendor shortcut without vendors:create and in edit mode', async () => {
    const { rerender } = await wrap(<ManufacturerForm mode="create" onSubmit={jest.fn()} />);
    expect(screen.queryByText('Save as Manufacturer + Vendor')).toBeNull();
    await rerender(<QueryClientProvider client={new QueryClient()}><ManufacturerForm mode="edit" canCreateVendor manufacturer={{ id: 'm', name: 'GSK', isActive: true } as never} onSubmit={jest.fn()} /></QueryClientProvider>);
    expect(screen.queryByText('Save as Manufacturer + Vendor')).toBeNull();
  });
});

describe('VendorForm', () => {
  it('requires a company of at least 2 characters', async () => {
    const onSubmit = jest.fn(async () => undefined);
    await wrap(<VendorForm mode="edit" vendor={{ id: 'v', company: 'City', branchId: 'b1', isActive: true } as never} onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByLabelText('Company'), 'X');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Company must be at least 2 characters')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('ProductForm', () => {
  const product = {
    id: 'p1', tenantId: 't1', branchId: 'b1', createdAt: '', updatedAt: '', name: 'Panadol', genericName: 'Paracetamol', manufacturerId: 'm1',
    unit: 'tab', tp: 10, cp: 8, rp: 12, status: ProductStatus.ACTIVE,
  } as Product;

  it('validates TP ≥ CP and RP ≥ TP before calling onSubmit, then submits normalised values', async () => {
    const onSubmit = jest.fn(async () => undefined);
    await wrap(<ProductForm mode="edit" product={product} onSubmit={onSubmit} />);
    // prices unlock once the admin profile has loaded
    await waitFor(() => expect(screen.getByLabelText('TP (trade)').props.editable).not.toBe(false));
    await fireEvent.changeText(screen.getByLabelText('TP (trade)'), '5');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Must be ≥ CP (8)')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('TP (trade)'), '9');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tp: '9', cp: '8', rp: '12', branchId: 'b1', manufacturerId: 'm1' }));
  });

  it('locks the price fields on edit without products:edit_prices', async () => {
    me = { ...me, tenantRole: TenantRole.TENANT_USER, branchId: 'b1', permissions: ['products:update', 'products:read'] };
    await wrap(<ProductForm mode="edit" product={product} onSubmit={jest.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('TP (trade)').props.editable).toBe(false));
    expect(screen.getByLabelText('CP (cost)').props.editable).toBe(false);
    expect(screen.getByLabelText('RP (retail)').props.editable).toBe(false);
    expect(screen.getByLabelText('Name').props.editable).not.toBe(false);
  });

  it('requires a vendor on create when the vendor field is shown', async () => {
    const onSubmit = jest.fn(async () => undefined);
    await wrap(<ProductForm mode="create" showVendor lockedBranchId="b1" onSubmit={onSubmit} />);
    await fireEvent.press(await screen.findByText('Save'));
    expect(await screen.findByText('Vendor is required')).toBeTruthy();
    expect(await screen.findByText('Manufacturer is required')).toBeTruthy();
    expect(await screen.findByText('Unit is required')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
