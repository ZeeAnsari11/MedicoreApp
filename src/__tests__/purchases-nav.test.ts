import { buildPermissionChecker } from '@/features/auth/permissions';
import { navSections } from '@/navigation/nav-config';
import { TenantRole } from '@/types/medicore';

const user = (permissions: string[], tenantRole = TenantRole.TENANT_USER) => buildPermissionChecker({ userId: 'u', tenantId: 't', username: 'x', tenantRole, permissions } as never);
const item = navSections.flatMap((s) => s.items).find((i) => i.href === '/purchases')!;

describe('Purchases navigation and permissions', () => {
  it('is listed under Operations and requires purchases:read', () => {
    expect(item.anyOf).toEqual(['purchases:read']);
    expect(navSections.find((s) => s.title === 'Operations')!.items).toContain(item);
  });

  it('purchases:read shows it; other modules do not; admin bypasses', () => {
    expect(user(['purchases:read']).hasAny(...item.anyOf!)).toBe(true);
    expect(user(['sales:read', 'inventory:read', 'vendors:read']).hasAny(...item.anyOf!)).toBe(false);
    expect(user([], TenantRole.TENANT_SUPER_ADMIN).has('purchases:read')).toBe(true);
  });

  it('create, update, return and record_payment are separate permissions', () => {
    const reader = user(['purchases:read']);
    for (const p of ['purchases:create', 'purchases:update', 'purchases:return', 'purchases:record_payment']) expect(reader.has(p)).toBe(false);
    expect(user(['purchases:record_payment']).has('purchases:return')).toBe(false);
  });
});
