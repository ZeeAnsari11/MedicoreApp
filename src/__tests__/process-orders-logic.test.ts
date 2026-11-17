import { pakistanToday, processDialog, processedToast, pruneSelection, selectionState, toggleAll, toggleOrder } from '@/features/process-orders/logic';
import { navSections } from '@/navigation/nav-config';
import { buildPermissionChecker } from '@/features/auth/permissions';
import { TenantRole } from '@/types/medicore';

const order = (id: string) => ({ id, orderNumber: `PO-M-${id}`, placedAt: '2026-11-15T05:00:00.000Z', itemCount: 1, grandTotal: 10 });
const orders = [order('a'), order('b'), order('c')];

describe('pakistanToday', () => {
  it('uses the UTC+5 calendar day, not the UTC day', () => {
    expect(pakistanToday(Date.parse('2026-11-14T18:59:59Z'))).toBe('2026-11-14');
    expect(pakistanToday(Date.parse('2026-11-14T19:00:00Z'))).toBe('2026-11-15');
  });
});

describe('selection', () => {
  it('toggles one order', () => {
    const one = toggleOrder(new Set(), 'a');
    expect([...one]).toEqual(['a']);
    expect(toggleOrder(one, 'a').size).toBe(0);
  });

  it('select-all selects everything, then clears', () => {
    const all = toggleAll(new Set(['a']), orders);
    expect(all.size).toBe(3);
    expect(toggleAll(all, orders).size).toBe(0);
    expect(toggleAll(new Set(), []).size).toBe(0);
  });

  it('reports none / some (indeterminate) / all', () => {
    expect(selectionState(new Set(), orders)).toBe('none');
    expect(selectionState(new Set(['a']), orders)).toBe('some');
    expect(selectionState(new Set(['a', 'b', 'c']), orders)).toBe('all');
  });

  it('drops ids that are no longer in the list', () => {
    expect([...pruneSelection(new Set(['a', 'gone']), orders)]).toEqual(['a']);
  });
});

describe('dialog and toast text', () => {
  it('uses the web wording; reject is destructive', () => {
    expect(processDialog('confirm', 2)).toMatchObject({ title: 'Confirm 2 orders?', confirmLabel: 'Yes, confirm', destructive: false });
    expect(processDialog('reject', 1)).toMatchObject({ title: 'Reject 1 order?', confirmLabel: 'Yes, reject', destructive: true });
    expect(processDialog('reject', 1).message).toContain('stock goes back to its batches');
  });

  it('reports the count the backend returned', () => {
    expect(processedToast('confirm', 3)).toBe('3 orders confirmed');
    expect(processedToast('reject', 1)).toBe('1 order rejected');
  });
});

describe('permission gating', () => {
  const user = (permissions: string[], tenantRole = TenantRole.TENANT_USER) => buildPermissionChecker({ userId: 'u', tenantId: 't', username: 'x', tenantRole, permissions } as never);
  const item = navSections.flatMap((s) => s.items).find((i) => i.href === '/sales/process-orders')!;

  it('is listed under Operations and requires process_orders:read', () => {
    expect(item.anyOf).toEqual(['process_orders:read']);
    expect(navSections.find((s) => s.title === 'Operations')!.items).toContain(item);
  });

  it('process_orders:read grants it; sales:* does not; admin bypasses', () => {
    expect(user(['process_orders:read']).hasAny(...item.anyOf!)).toBe(true);
    expect(user(['sales:read', 'sales:create', 'sales:update', 'sales:void', 'sales:view_all']).hasAny(...item.anyOf!)).toBe(false);
    expect(user([], TenantRole.TENANT_SUPER_ADMIN).has('process_orders:read')).toBe(true);
  });
});
