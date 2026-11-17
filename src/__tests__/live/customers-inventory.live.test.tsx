/**
 * Live contract test for Customers / Inventory / Stock transfers against a REAL Medicore API (skipped unless LIVE_API_URL is set).
 *
 *   LIVE_API_URL=http://127.0.0.1:4100/api LIVE_PLATFORM_USER=platform LIVE_PLATFORM_PASSWORD=... npx jest src/__tests__/live
 *
 * Point it at a throwaway database: it creates a tenant, branches, a role, users, customers, products, stock and transfers.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { apiFetch } from '@/api/client';
import { useCustomers } from '@/features/customers/use-customers';
import { buildCustomerCreate, buildCustomerUpdate, customerDefaults } from '@/features/customers/schema';
import { usePartyBalances, usePartyLedger } from '@/features/ledgers/use-party-ledger';
import { adjustmentDefaults, buildAdjustment } from '@/features/inventory/schema';
import { useAdjustStock, useExpiringBatches, useInventoryRollup, useProductBatches } from '@/features/inventory/use-inventory';
import { buildTransfer } from '@/features/transfers/schema';
import { useCreateTransfer, useStockTransfer, useStockTransfers } from '@/features/transfers/use-transfers';
import { createClerk, createLiveTenant, installNodeFetch, liveWrapper, login, toasts, type LiveTenant } from '@/test-support/live';
import { useBranchStore } from '@/store/branch';
import type { Account, Batch, Customer, PartyBalancesResponse, Product } from '@/types/medicore';

// babel-jest hoists this above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: process.env.LIVE_API_URL ?? '', API_URL_CONFIGURED: !!process.env.LIVE_API_URL, REQUEST_TIMEOUT_MS: 20000 }));

installNodeFetch();
const live = process.env.LIVE_API_URL ? describe : describe.skip;
jest.setTimeout(90000);

live('customers, inventory and transfers against the real API', () => {
  let t: LiveTenant;
  let clerk: { username: string; password: string };
  let product: Product;
  let batchId = '';
  // One QueryClient per test, shared by every hook in it (like the app), so a mutation's invalidation reaches the list hooks.
  let W = liveWrapper();
  beforeEach(() => { W = liveWrapper(); });

  beforeAll(async () => {
    t = await createLiveTenant('ci');
    const mfr = await apiFetch<{ id: string }>('/manufacturers', { method: 'POST', body: { name: `Mfr ${t.suffix}`, branchId: t.main.id } });
    product = await apiFetch<Product>('/products', {
      method: 'POST',
      body: { name: `Panadol ${t.suffix}`, genericName: 'Paracetamol', manufacturerId: mfr.id, unit: 'tablet', tp: 10, cp: 8, rp: 12, minStockLevel: 5, branchId: t.main.id },
    });
    clerk = await createClerk(t.suffix, t.main.id, ['customers:read', 'customers:create', 'customers:update', 'inventory:read', 'branches:read']);
    await login(t.admin.username, t.admin.password);
  });

  it('Customers: create, list with ledger-derived balance, edit, ledger, balances, delete rules', async () => {
    const { result } = await renderHook(() => useCustomers(), { wrapper: W });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let ali!: Customer;
    await act(async () => { ali = await result.current.create(buildCustomerCreate({ ...customerDefaults(undefined, t.main.id), name: `Ali Store ${t.suffix}`, phone: '0300', isDealer: false })); });
    expect(ali).toMatchObject({ name: `Ali Store ${t.suffix}`, branchId: t.main.id, phone: '0300', isDealer: false });
    await waitFor(() => expect(result.current.customers.find((c) => c.id === ali.id)?.outstandingBalance).toBe(0));

    await act(async () => { await result.current.update(ali.id, buildCustomerUpdate({ ...customerDefaults(ali), isDealer: true, address: 'Lahore' })); });
    await waitFor(() => expect(result.current.customers.find((c) => c.id === ali.id)).toMatchObject({ isDealer: true, address: 'Lahore' }));

    // Give the customer a real receivable through the accounting API (the backend's own opening-balance flow).
    const accounts = await apiFetch<Account[]>('/accounting/accounts');
    const ar = accounts.find((a) => a.systemKey === 'ACCOUNTS_RECEIVABLE')!;
    const equity = accounts.find((a) => a.systemKey === 'OPENING_BALANCE_EQUITY')!;
    await apiFetch('/accounting/opening-balances', {
      method: 'POST',
      body: { branchId: t.main.id, description: 'Opening', lines: [{ accountId: ar.id, debit: 500, credit: 0, partyType: 'CUSTOMER', partyId: ali.id }, { accountId: equity.id, debit: 0, credit: 500 }] },
    });
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.customers.find((c) => c.id === ali.id)?.outstandingBalance).toBe(500));

    const ledger = await renderHook(() => usePartyLedger('customers', ali.id, { from: '2020-01-01', to: '2099-12-31', page: 1, limit: 25, branchId: t.main.id }), { wrapper: W });
    await waitFor(() => expect(ledger.result.current.ledger).toBeDefined());
    expect(ledger.result.current.ledger).toMatchObject({ partyId: ali.id, closingBalance: 500, total: 1 });
    expect(ledger.result.current.ledger?.rows[0]).toMatchObject({ debit: 500, credit: 0, runningBalance: 500 });
    expect(ledger.result.current.ledger?.summary.closingBalance).toBe(500);

    const balances = await renderHook(() => usePartyBalances('customers', { search: 'Ali', hasBalance: true, sortBy: 'balance', sortDir: 'desc', page: 1, limit: 25 }), { wrapper: W });
    await waitFor(() => expect(balances.result.current.balances).toBeDefined());
    expect((balances.result.current.balances as PartyBalancesResponse).items.find((r) => r.partyId === ali.id)?.balance).toBe(500);

    // The backend refuses to delete a customer who owes money, and the app reports that instead of success.
    await act(async () => { await expect(result.current.remove(ali.id)).rejects.toMatchObject({ status: 409 }); });
    expect(toasts()).toContain('This customer has an outstanding balance and cannot be removed');
    expect(toasts()).not.toContain('Customer deleted');

    // A customer with no balance can be deleted and then disappears from the list.
    let temp!: Customer;
    await act(async () => { temp = await result.current.create(buildCustomerCreate({ ...customerDefaults(undefined, t.main.id), name: `Temp ${t.suffix}` })); });
    await act(async () => { await result.current.remove(temp.id); });
    await waitFor(() => expect(result.current.customers.find((c) => c.id === temp.id)).toBeUndefined());
  });

  it('Customers: a restricted branch user is isolated and permission-gated', async () => {
    await login(clerk.username, clerk.password);
    const { result } = await renderHook(() => useCustomers(), { wrapper: W });
    await waitFor(() => expect(result.current.customers.length).toBeGreaterThan(0));

    await act(async () => { await result.current.create({ name: `Clerk customer ${t.suffix}`, branchId: t.main.id }); });
    await act(async () => { await expect(result.current.create({ name: 'Elsewhere', branchId: t.north.id })).rejects.toMatchObject({ status: 403 }); });
    const first = result.current.customers[0];
    await act(async () => { await expect(result.current.remove(first.id)).rejects.toMatchObject({ status: 403 }); });
    await expect(apiFetch(`/accounting/customers/${first.id}/ledger`)).rejects.toMatchObject({ status: 403 });
    await login(t.admin.username, t.admin.password);
  });

  it('Inventory: adjustments follow the backend rules; rollup, batches and expiring reflect them', async () => {
    const adjust = await renderHook(() => useAdjustStock(), { wrapper: W });
    const form = (o: Record<string, string>) => buildAdjustment({ ...adjustmentDefaults({ branchId: t.main.id, productId: product.id }), batchNumber: 'B1', expiryDate: '2027-12-31', quantity: '50', ...o });

    await act(async () => { await adjust.result.current.adjust(form({ operation: 'add' })); });
    expect(toasts()).toContain('Stock adjusted');

    const rollup = await renderHook(() => useInventoryRollup(t.main.id), { wrapper: W });
    await waitFor(() => expect(rollup.result.current.rollup.find((r) => r.productId === product.id)?.totalQuantity).toBe(50));
    const row = rollup.result.current.rollup.find((r) => r.productId === product.id)!;
    expect(row).toMatchObject({ totalQuantity: 50, isLowStock: false, minStockLevel: 5 });
    expect(row.nearestExpiryDate?.slice(0, 10)).toBe('2027-12-31');

    const batches = await renderHook(() => useProductBatches(product.id, t.main.id), { wrapper: W });
    await waitFor(() => expect(batches.result.current.batches).toHaveLength(1));
    const b1 = batches.result.current.batches[0] as Batch;
    batchId = b1.id;
    expect(b1).toMatchObject({ batchNumber: 'B1', quantity: 50, purchasePrice: 8, sellingPrice: 10, branchId: t.main.id });

    // refusals come back as 400 with the backend's own message, and no stock changes
    await act(async () => { await expect(adjust.result.current.adjust(form({ operation: 'subtract', quantity: '99' }))).rejects.toMatchObject({ status: 400 }); });
    expect(toasts().join()).toMatch(/does not have enough quantity to subtract 99/);
    await act(async () => { await expect(adjust.result.current.adjust(form({ operation: 'subtract', batchNumber: 'NOPE' }))).rejects.toMatchObject({ status: 400 }); });
    expect(toasts().join()).toMatch(/does not exist/);
    await act(async () => { await expect(adjust.result.current.adjust(form({ operation: 'add', expiryDate: '2028-01-01' }))).rejects.toMatchObject({ status: 400 }); });
    expect(toasts().join()).toMatch(/already exists with a different expiry date/);

    await act(async () => { await adjust.result.current.adjust(form({ operation: 'subtract', quantity: '20', reason: 'damaged' })); });
    await act(async () => { await adjust.result.current.adjust(form({ operation: 'set', quantity: '7', sellingPrice: '11' })); });
    await waitFor(() => expect(rollup.result.current.rollup.find((r) => r.productId === product.id)?.totalQuantity).toBe(7));
    await waitFor(() => expect(batches.result.current.batches[0]).toMatchObject({ quantity: 7, sellingPrice: 11 }));

    // a second, short-dated batch shows up as expiring and as the nearest expiry
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await act(async () => { await adjust.result.current.adjust(form({ operation: 'add', batchNumber: 'B2', expiryDate: soon, quantity: '3' })); });
    const expiring = await renderHook(() => useExpiringBatches(30, t.main.id), { wrapper: W });
    await waitFor(() => expect(expiring.result.current.batches.map((b) => b.batchNumber)).toEqual(['B2']));
    expect(expiring.result.current.batches[0].productName).toBe(product.name);
    await waitFor(() => expect(rollup.result.current.rollup.find((r) => r.productId === product.id)).toMatchObject({ totalQuantity: 10, isLowStock: false }));
  });

  it('Inventory: a branch user without inventory:adjust is refused and cannot read another branch', async () => {
    await login(clerk.username, clerk.password);
    const adjust = await renderHook(() => useAdjustStock(), { wrapper: W });
    await act(async () => { await expect(adjust.result.current.adjust(buildAdjustment({ ...adjustmentDefaults({ branchId: t.main.id, productId: product.id }), batchNumber: 'B1', expiryDate: '2027-12-31', quantity: '1' }))).rejects.toMatchObject({ status: 403 }); });
    const own = await apiFetch<unknown[]>('/inventory');
    expect(own.length).toBeGreaterThan(0);
    await expect(apiFetch(`/inventory?branchId=${t.north.id}`)).rejects.toMatchObject({ status: 403 });
    useBranchStore.setState({ selection: t.north.id });
    await expect(apiFetch('/inventory')).rejects.toMatchObject({ status: 403 });
    useBranchStore.setState({ selection: null });
    const create = await renderHook(() => useCreateTransfer(), { wrapper: W });
    await act(async () => { await expect(create.result.current.create({ toBranchId: t.north.id, lines: [{ batchId, quantity: 1 }] })).rejects.toMatchObject({ status: 403 }); });
    await login(t.admin.username, t.admin.password);
  });

  it('Stock transfers: create, move stock atomically, list/detail, and the backend rules', async () => {
    const create = await renderHook(() => useCreateTransfer(), { wrapper: W });
    const lines = [{ batchId, quantity: 5 }];
    let created!: Awaited<ReturnType<typeof create.result.current.create>>;
    await act(async () => { created = await create.result.current.create(buildTransfer({ fromBranchId: t.main.id, toBranchId: t.north.id, note: ' weekly ' }, [{ batchId, productId: product.id, productName: product.name, batchNumber: 'B1', expiryDate: '2027-12-31', available: 7, quantity: '5' }])); });
    expect(created).toMatchObject({ transferNumber: 'TR-MN-000001', branchId: t.main.id, toBranchId: t.north.id, note: 'weekly' });
    expect(created._id).toBeTruthy();
    expect(created.lines[0]).toMatchObject({ productName: product.name, batchNumber: 'B1', quantity: 5, unitCost: 8 });
    expect(toasts()).toContain('Transfer TR-MN-000001 created');

    // stock moved: source 7-5=2 in B1, destination received 5 under its own copy of the product
    const main = await apiFetch<Batch[]>(`/inventory/${product.id}/batches?branchId=${t.main.id}`);
    expect(main.find((b) => b.batchNumber === 'B1')?.quantity).toBe(2);
    const northRollup = await apiFetch<{ productId: string; totalQuantity: number }[]>(`/inventory?branchId=${t.north.id}`);
    expect(northRollup.filter((r) => r.totalQuantity === 5)).toHaveLength(1);

    const list = await renderHook(() => useStockTransfers(t.north.id), { wrapper: W });
    await waitFor(() => expect(list.result.current.transfers).toHaveLength(1));
    expect(list.result.current.transfers[0].transferNumber).toBe('TR-MN-000001');
    const detail = await renderHook(() => useStockTransfer(created._id), { wrapper: W });
    await waitFor(() => expect(detail.result.current.transfer?.lines).toHaveLength(1));

    // refusals: more than the batch holds, same branch, empty lines
    await act(async () => { await expect(create.result.current.create({ fromBranchId: t.main.id, toBranchId: t.north.id, lines: [{ batchId, quantity: 50 }] })).rejects.toMatchObject({ status: 400 }); });
    expect(toasts().join()).toMatch(/less than 50 in stock/);
    await act(async () => { await expect(create.result.current.create({ fromBranchId: t.main.id, toBranchId: t.main.id, lines })).rejects.toMatchObject({ status: 400 }); });
    expect(toasts().join()).toMatch(/must differ/);
    await act(async () => { await expect(create.result.current.create({ fromBranchId: t.main.id, toBranchId: t.north.id, lines: [] })).rejects.toMatchObject({ status: 400 }); });
    const after = await apiFetch<Batch[]>(`/inventory/${product.id}/batches?branchId=${t.main.id}`);
    expect(after.find((b) => b.batchNumber === 'B1')?.quantity).toBe(2); // refused transfers moved nothing
  });
});
