/**
 * Live contract test for Administration (Branches, Roles, Users, Permission catalog) against a REAL Medicore API
 * (skipped unless LIVE_API_URL is set).
 *
 *   LIVE_API_URL=http://127.0.0.1:4100/api LIVE_PLATFORM_USER=platform LIVE_PLATFORM_PASSWORD=... npx jest src/__tests__/live/administration.live
 *
 * Point it at a throwaway database. CRUD goes through the app's hooks; the security probes call the endpoints directly
 * so they prove what the backend enforces, not what the UI hides. Tests named "backend limitation" pin current backend
 * behaviour that docs/FEATURE_PARITY.md lists as a known gap; they are evidence, not endorsement.
 */
import { act, renderHook } from '@testing-library/react-native';

import { apiFetch } from '@/api/client';
import { ApiError } from '@/api/errors';
import { useBranchAdmin } from '@/features/branches/use-branch-admin';
import { usePermissionCatalog } from '@/features/permissions/use-permission-catalog';
import { useRoles } from '@/features/roles/use-roles';
import { useUsers } from '@/features/users/use-users';
import { createClerk, createLiveTenant, installNodeFetch, LIVE_LOCATION, liveWrapper, login, toasts, type LiveTenant } from '@/test-support/live';
import type { Branch, Permission, Role, User } from '@/types/medicore';

// babel-jest hoists this above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: process.env.LIVE_API_URL ?? '', API_URL_CONFIGURED: !!process.env.LIVE_API_URL, REQUEST_TIMEOUT_MS: 20000 }));

installNodeFetch();
const live = process.env.LIVE_API_URL ? describe : describe.skip;
jest.setTimeout(120000);

/** Resolves with the ApiError a request fails with (and fails the test if it succeeds). */
const failure = (p: Promise<unknown>) => p.then(() => { throw new Error('expected the request to fail'); }, (e: unknown) => e as ApiError);
const W = () => liveWrapper();

live('Administration against the real API', () => {
  let t: LiveTenant;
  let clerk: { username: string; password: string };
  let clerkUser: User;

  beforeAll(async () => {
    t = await createLiveTenant('adm');
    clerk = await createClerk(t.suffix, t.north.id, ['customers:read']);
    clerkUser = (await apiFetch<User[]>('/users')).find((u) => u.username === clerk.username)!;
  });

  const asAdmin = () => login(t.admin.username, t.admin.password);

  describe('branches', () => {
    beforeAll(asAdmin);

    it('creates (code uppercased), edits, and refuses a duplicate code with the exact message', async () => {
      const api = await renderHook(() => useBranchAdmin(), { wrapper: W() });
      let b!: Branch;
      await act(async () => { b = await api.result.current.create({ name: 'South', code: 'sth' }); });
      expect(b.code).toBe('STH');
      expect(toasts()).toContain('Branch created successfully');
      await act(async () => { await api.result.current.update(b.id, { address: 'GT Rd' }); });
      const e = await failure(apiFetch('/branches', { method: 'POST', body: { name: 'South 2', code: 'STH' } }));
      expect([e.status, e.message]).toEqual([409, 'A branch with code "STH" already exists']);
    });

    it('the main branch cannot be deactivated or deleted', async () => {
      const off = await failure(apiFetch(`/branches/${t.main.id}/status`, { method: 'PATCH', body: { isActive: false } }));
      expect([off.status, off.message]).toEqual([409, 'The main branch cannot be deactivated']);
      const del = await failure(apiFetch(`/branches/${t.main.id}`, { method: 'DELETE' }));
      expect([del.status, del.message]).toEqual([409, 'The main branch cannot be deleted']);
    });

    it('a branch with users cannot be deleted; an empty one can; deactivate/activate round-trips', async () => {
      const api = await renderHook(() => useBranchAdmin(), { wrapper: W() });
      await act(async () => { await api.result.current.remove(t.north.id).catch(() => undefined); });
      expect(toasts()).toContain('This branch is assigned to 1 user(s). Please reassign them first.');
      const spare = await apiFetch<Branch>('/branches', { method: 'POST', body: { name: 'Spare', code: `SP${t.suffix.slice(-3)}` } });
      await act(async () => { await api.result.current.setStatus(spare.id, false); });
      expect(toasts()).toContain('Branch deactivated');
      await act(async () => { await api.result.current.setStatus(spare.id, true); });
      await act(async () => { await api.result.current.remove(spare.id); });
      expect(toasts()).toContain('Branch deleted successfully');
      expect((await apiFetch<Branch[]>('/branches')).some((b) => b.id === spare.id)).toBe(false);
    });
  });

  describe('roles', () => {
    beforeAll(asAdmin);

    it('any action implies :read (server normalization)', async () => {
      const api = await renderHook(() => useRoles(), { wrapper: W() });
      let r!: Role;
      await act(async () => { r = await api.result.current.create({ name: `Norm ${t.suffix}`, allowedModules: ['sales:create'] }); });
      expect(r.allowedModules).toEqual(expect.arrayContaining(['sales:create', 'sales:read']));
      const dup = await failure(apiFetch('/roles', { method: 'POST', body: { name: `Norm ${t.suffix}`, allowedModules: [] } }));
      expect([dup.status, dup.message]).toEqual([409, `A role named "Norm ${t.suffix}" already exists`]);
      await act(async () => { await api.result.current.remove(r.id); });
      expect(toasts()).toContain('Role deleted successfully');
    });

    it('a role in use cannot be deleted', async () => {
      const e = await failure(apiFetch(`/roles/${clerkUser.roleId}`, { method: 'DELETE' }));
      expect([e.status, e.message]).toEqual([409, 'This role is assigned to 1 user(s). Please reassign them or deactivate this role instead.']);
    });

    it('/permissions/modules returns the module catalogue the menu picker uses', async () => {
      const res = await apiFetch<{ modules: { key: string; actions: unknown[] }[] }>('/permissions/modules');
      const keys = res.modules.map((m) => m.key);
      expect(keys).toEqual(expect.arrayContaining(['dashboard', 'sales', 'acc_overview', 'users', 'roles', 'branches', 'permissions']));
    });
  });

  describe('users', () => {
    beforeAll(asAdmin);

    it('creates a user with a one-time temporary password that logs in', async () => {
      const api = await renderHook(() => useUsers(), { wrapper: W() });
      let created!: User & { temporaryPassword: string };
      await act(async () => { created = await api.result.current.create({ username: `Temp${t.suffix}`, fullName: 'Temp User', ...LIVE_LOCATION, tenantRole: 'TENANT_USER' as never, branchId: t.main.id }); });
      expect(created.username).toBe(`temp${t.suffix}`);
      expect(created.temporaryPassword).toHaveLength(12);
      expect(api.result.current.users.some((u) => 'temporaryPassword' in u)).toBe(false);
      const dup = await failure(apiFetch('/users', { method: 'POST', body: { username: `temp${t.suffix}`, fullName: 'Again', ...LIVE_LOCATION, tenantRole: 'TENANT_USER', branchId: t.main.id } }));
      expect([dup.status, dup.message]).toEqual([409, 'A user with this username already exists in this organization.']);
      await login(`temp${t.suffix}`, created.temporaryPassword);
      await asAdmin();
    });

    it('the admin cannot deactivate themself or change their own access level', async () => {
      const me = (await apiFetch<User[]>('/users')).find((u) => u.username === t.admin.username)!;
      const off = await failure(apiFetch(`/users/${me.id}/status`, { method: 'PATCH', body: { status: 'DISABLED' } }));
      expect([off.status, off.message]).toEqual([409, 'You cannot deactivate your own account']);
      const demote = await failure(apiFetch(`/users/${me.id}`, { method: 'PATCH', body: { tenantRole: 'TENANT_USER' } }));
      expect([demote.status, demote.message]).toEqual([409, 'You cannot change your own access level']);
    });

    it('edit clears the role with null and moves the branch (a branch cannot be cleared); the status endpoint accepts ACTIVE/DISABLED', async () => {
      const u = await apiFetch<User & { temporaryPassword: string }>('/users', { method: 'POST', body: { username: `edit${t.suffix}`, fullName: 'Edit Me', ...LIVE_LOCATION, tenantRole: 'TENANT_USER', roleId: clerkUser.roleId, branchId: t.main.id } });
      const api = await renderHook(() => useUsers(), { wrapper: W() });
      await act(async () => { await api.result.current.update(u.id, { roleId: null, branchId: t.north.id, city: 'Karachi' }); });
      const after = await apiFetch<User>(`/users/${u.id}`);
      expect(after.roleId ?? null).toBeNull();
      expect([after.branchId, after.city, after.territory]).toEqual([t.north.id, 'Karachi', LIVE_LOCATION.territory]);
      const clear = await failure(apiFetch(`/users/${u.id}`, { method: 'PATCH', body: { branchId: null } }));
      expect(clear.status).toBe(400);
      await act(async () => { await api.result.current.setStatus(u.id, 'DISABLED' as never); });
      expect(toasts()).toContain('User disabled');
    });
  });

  describe('authorization is enforced by the backend', () => {
    afterAll(asAdmin);

    it('a clerk without users:read / roles:read / branches:read gets 403 "Insufficient permissions"', async () => {
      await login(clerk.username, clerk.password);
      for (const path of ['/users', '/roles', '/permissions']) {
        const e = await failure(apiFetch(path));
        expect([path, e.status, e.message]).toEqual([path, 403, 'Insufficient permissions']);
      }
      const e = await failure(apiFetch('/branches', { method: 'POST', body: { name: 'Hack', code: 'HK' } }));
      expect(e.status).toBe(403);
    });

    it('a branch user cannot read another branch via X-Branch-Id', async () => {
      await login(clerk.username, clerk.password);
      await apiFetch('/customers');
      const e = await failure(apiFetch('/customers', { headers: { 'X-Branch-Id': t.main.id } }));
      expect([e.status, e.message]).toEqual([403, 'You do not have access to that branch']);
    });

    it('deactivating the role removes its permissions on the next request', async () => {
      await asAdmin();
      await apiFetch(`/roles/${clerkUser.roleId}/status`, { method: 'PATCH', body: { isActive: false } });
      await login(clerk.username, clerk.password);
      expect((await failure(apiFetch('/customers'))).status).toBe(403);
      await asAdmin();
      await apiFetch(`/roles/${clerkUser.roleId}/status`, { method: 'PATCH', body: { isActive: true } });
      await login(clerk.username, clerk.password);
      await apiFetch('/customers');
    });

    it('a non-admin with users:update cannot demote the last active admin', async () => {
      await asAdmin();
      const mgr = await createClerk(`${t.suffix}m`, t.main.id, ['users:read', 'users:update']);
      const admin = (await apiFetch<User[]>('/users')).find((u) => u.username === t.admin.username)!;
      await login(mgr.username, mgr.password);
      const e = await failure(apiFetch(`/users/${admin.id}`, { method: 'PATCH', body: { tenantRole: 'TENANT_USER' } }));
      expect([e.status, e.message]).toEqual([409, 'Cannot demote the last active admin of this organization']);
    });

    it('backend limitation: a non-admin with users:create can create a tenant admin', async () => {
      await asAdmin();
      const hr = await createClerk(`${t.suffix}h`, t.main.id, ['users:read', 'users:create']);
      await login(hr.username, hr.password);
      const u = await apiFetch<User>('/users', { method: 'POST', body: { username: `esc${t.suffix}`, fullName: 'Escalated', ...LIVE_LOCATION, tenantRole: 'TENANT_SUPER_ADMIN', branchId: t.main.id } });
      expect(u.tenantRole).toBe('TENANT_SUPER_ADMIN');
    });

    it('backend limitation: a non-admin with users:update can grant themself extra permissions (PUT /users/:id/permissions)', async () => {
      await asAdmin();
      const self = await createClerk(`${t.suffix}s`, t.main.id, ['users:read', 'users:update']);
      await login(self.username, self.password);
      const me = (await apiFetch<User[]>('/users')).find((u) => u.username === self.username)!;
      expect((await failure(apiFetch('/branches', { method: 'POST', body: { name: 'Nope', code: 'NP' } }))).status).toBe(403);
      const lose = await failure(apiFetch(`/users/${me.id}/permissions`, { method: 'PUT', body: { permissions: ['users:read'] } }));
      expect([lose.status, lose.message]).toEqual([403, 'You cannot remove your own ability to manage users']);
      await apiFetch(`/users/${me.id}/permissions`, { method: 'PUT', body: { permissions: ['users:read', 'users:update', 'branches:read', 'branches:create'] } });
      const b = await apiFetch<Branch>('/branches', { method: 'POST', body: { name: 'Self granted', code: `SG${t.suffix.slice(-3)}` } });
      expect(b.id).toBeTruthy();
    });

    it('backend limitation: a disabled user can still log in, but permission-protected routes refuse them', async () => {
      await asAdmin();
      const off = await createClerk(`${t.suffix}d`, t.main.id, ['customers:read']);
      const u = (await apiFetch<User[]>('/users')).find((x) => x.username === off.username)!;
      await apiFetch(`/users/${u.id}/status`, { method: 'PATCH', body: { status: 'DISABLED' } });
      await login(off.username, off.password);
      expect((await failure(apiFetch('/customers'))).status).toBe(403);
    });
  });

  describe('tenant isolation', () => {
    let other: LiveTenant;
    beforeAll(async () => { other = await createLiveTenant('iso'); });
    afterAll(asAdmin);

    it("another tenant's admin cannot see or change this tenant's branches, roles or users", async () => {
      await login(other.admin.username, other.admin.password);
      expect((await apiFetch<User[]>('/users')).some((u) => u.id === clerkUser.id)).toBe(false);
      expect((await apiFetch<Branch[]>('/branches')).some((b) => b.id === t.north.id)).toBe(false);
      const b = await failure(apiFetch(`/branches/${t.north.id}`, { method: 'PATCH', body: { name: 'Stolen' } }));
      expect([b.status, b.message]).toEqual([404, 'Branch not found']);
      const r = await failure(apiFetch(`/roles/${clerkUser.roleId}`, { method: 'PATCH', body: { name: 'Stolen' } }));
      expect([r.status, r.message]).toEqual([404, 'Role not found']);
      const u = await failure(apiFetch(`/users/${clerkUser.id}/status`, { method: 'PATCH', body: { status: 'DISABLED' } }));
      expect(u.status).toBe(404);
      const assign = await failure(apiFetch('/users', { method: 'POST', body: { username: `x${other.suffix}`, fullName: 'Cross', ...LIVE_LOCATION, tenantRole: 'TENANT_USER', roleId: clerkUser.roleId, branchId: other.main.id } }));
      expect([assign.status, assign.message]).toEqual([404, 'Role not found']);
      const header = await failure(apiFetch('/customers', { headers: { 'X-Branch-Id': t.north.id } }));
      expect([header.status, header.message]).toEqual([403, 'Branch does not belong to your tenant']);
    });
  });

  describe('permission catalog', () => {
    beforeAll(asAdmin);

    it('lists system entries, creates and edits a custom one, refuses duplicates and system edits', async () => {
      const api = await renderHook(() => usePermissionCatalog(), { wrapper: W() });
      // Backend quirk the hook works around: permission documents carry `_id` and no `id`.
      const all = await apiFetch<(Permission & { _id: string })[]>('/permissions');
      const system = all.find((p) => p.isSystem)!;
      expect(system.id).toBeUndefined();
      expect(system._id).toMatch(/^[0-9a-f]{24}$/);
      let p!: Permission;
      await act(async () => { p = await api.result.current.create({ key: `custom${t.suffix.replace(/[^a-z0-9]/g, '')}:approve`, name: 'Approve', module: 'custom' }); });
      expect(p.isSystem).toBe(false);
      expect(p.id).toMatch(/^[0-9a-f]{24}$/);
      await act(async () => { await api.result.current.update(p.id, { name: 'Approve orders', description: 'Sign off', module: 'custom' }); });
      // Backend limitation the app works around: a partial PATCH (only `name`) is a 500.
      const partial = await failure(apiFetch(`/permissions/${p.id}`, { method: 'PATCH', body: { name: 'Only name' } }));
      expect(partial.status).toBe(500);
      const after = (await apiFetch<(Permission & { _id: string })[]>('/permissions')).find((x) => x._id === p.id)!;
      expect([after.name, after.description, after.module]).toEqual(['Approve orders', 'Sign off', 'custom']);
      const dup = await failure(apiFetch('/permissions', { method: 'POST', body: { key: p.key, name: 'Again', module: 'custom' } }));
      expect([dup.status, dup.message]).toEqual([409, `A permission with key "${p.key}" already exists in this organization`]);
      const sys = await failure(apiFetch(`/permissions/${system._id}`, { method: 'PATCH', body: { name: 'Hacked' } }));
      expect([sys.status, sys.message]).toEqual([404, 'Permission not found or does not belong to your organization']);
    });
  });
});
