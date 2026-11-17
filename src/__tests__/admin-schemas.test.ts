import { branchSchema, buildBranchCreate, buildBranchUpdate, branchDefaults } from '@/features/branches/branch-schema';
import { permissionSchema, buildPermissionCreate, buildPermissionUpdate, permissionDefaults } from '@/features/permissions/permission-schema';
import { allMenusOn, isMenuOn, keysOf, menuGroups, moduleCount, setMenus, toggleMenu } from '@/features/roles/menu-picker-logic';
import { buildRoleCreate, buildRoleUpdate, roleDefaults, roleSchema } from '@/features/roles/role-schema';
import { buildUserCreate, buildUserUpdate, roleForTenantRole, userDefaults, userSchema } from '@/features/users/user-schema';
import { TenantRole, UserStatus, type Branch, type Permission, type PermissionModuleDef, type Role, type User } from '@/types/medicore';

const base = { id: 'x', tenantId: 't1', createdAt: '', updatedAt: '' };
const branch = { ...base, name: 'North', code: 'NB', address: 'Mall Rd', isMain: false, isActive: true } as Branch;
const role = { ...base, name: 'Clerk', description: 'Front desk', allowedModules: ['sales:read'], isActive: true } as Role;
const user = { ...base, username: 'ali', fullName: 'Ali Khan', status: UserStatus.ACTIVE, tenantRole: TenantRole.TENANT_USER, roleId: 'r1', branchId: 'b1', territory: 'North', city: 'Lahore', address: 'Mall Road' } as User;
const perm = { ...base, tenantId: 't1', key: 'custom:approve', name: 'Approve', module: 'custom', isSystem: false, isActive: true } as Permission;

const firstError = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? undefined : r.error?.issues[0].message);

describe('branch schema', () => {
  it('requires name and code of at least 2 characters (web messages)', () => {
    expect(firstError(branchSchema.safeParse({ ...branchDefaults(), code: 'AB' }))).toBe('Name is required');
    expect(firstError(branchSchema.safeParse({ ...branchDefaults(), name: 'A', code: 'AB' }))).toBe('Too short');
    expect(firstError(branchSchema.safeParse({ ...branchDefaults(), name: 'AB', code: '' }))).toBe('Code is required');
    expect(branchSchema.safeParse({ ...branchDefaults(), name: 'AB', code: 'CD' }).success).toBe(true);
  });

  it('create uppercases the code and omits blank optionals', () => {
    expect(buildBranchCreate({ name: 'North', code: 'nb', address: ' ', phone: '', isMain: false })).toEqual({ name: 'North', code: 'NB', address: undefined, phone: undefined, isMain: undefined });
    expect(buildBranchCreate({ name: 'North', code: 'nb', address: 'Mall', phone: '0300', isMain: true })).toMatchObject({ address: 'Mall', phone: '0300', isMain: true });
  });

  it('update sends only changed fields', () => {
    expect(buildBranchUpdate(branchDefaults(branch), branch)).toEqual({});
    expect(buildBranchUpdate({ ...branchDefaults(branch), code: 'nb' }, branch)).toEqual({});
    expect(buildBranchUpdate({ ...branchDefaults(branch), name: 'N2', address: '', isMain: true }, branch)).toEqual({ name: 'N2', address: '', isMain: true });
  });
});

describe('role schema', () => {
  it('requires a name of at least 2 characters', () => {
    expect(firstError(roleSchema.safeParse({ name: 'A', allowedModules: [] }))).toBe('Name must be at least 2 characters');
    expect(roleSchema.safeParse({ name: 'Ab', allowedModules: [] }).success).toBe(true);
  });

  it('create allows an empty menu list; update always sends allowedModules', () => {
    expect(buildRoleCreate({ name: 'X1', description: '  ', allowedModules: [] })).toEqual({ name: 'X1', description: undefined, allowedModules: [] });
    expect(buildRoleUpdate(roleDefaults(role), role)).toEqual({ allowedModules: ['sales:read'] });
    expect(buildRoleUpdate({ ...roleDefaults(role), name: 'Clerk 2', description: '' }, role)).toEqual({ name: 'Clerk 2', description: '', allowedModules: ['sales:read'] });
  });
});

describe('user schema', () => {
  const valid = { ...userDefaults(), username: 'ali.k', fullName: 'Ali', territory: 'North', city: 'Lahore', address: 'Mall Road', branchId: 'b1' };
  it('applies the web username and name rules', () => {
    expect(firstError(userSchema.safeParse({ ...valid, username: '' }))).toBe('Username is required');
    expect(firstError(userSchema.safeParse({ ...valid, username: 'al' }))).toBe('Username must be at least 3 characters');
    expect(firstError(userSchema.safeParse({ ...valid, username: 'ali khan' }))).toBe('Only letters, numbers, dots, dashes and underscores');
    expect(firstError(userSchema.safeParse({ ...valid, fullName: 'A' }))).toBe('Name must be at least 2 characters');
    expect(userSchema.safeParse({ ...valid, username: 'Ali_K-1.x' }).success).toBe(true);
  });

  it('requires territory, city, address and a branch (API CreateUserDto limits)', () => {
    expect(firstError(userSchema.safeParse({ ...valid, territory: '  ' }))).toBe('Territory is required');
    expect(firstError(userSchema.safeParse({ ...valid, city: '' }))).toBe('City is required');
    expect(firstError(userSchema.safeParse({ ...valid, address: '' }))).toBe('Address is required');
    expect(firstError(userSchema.safeParse({ ...valid, branchId: null }))).toBe('Branch is required');
    expect(firstError(userSchema.safeParse({ ...valid, city: 'x'.repeat(101) }))).toBe('City must be at most 100 characters');
    expect(firstError(userSchema.safeParse({ ...valid, address: 'x'.repeat(301) }))).toBe('Address must be at most 300 characters');
    expect(userSchema.safeParse({ ...valid, address: 'x'.repeat(300) }).success).toBe(true);
  });

  it('an Admin carries no assigned role', () => {
    expect(roleForTenantRole(TenantRole.TENANT_SUPER_ADMIN, 'r1')).toBeNull();
    expect(roleForTenantRole(TenantRole.TENANT_USER, 'r1')).toBe('r1');
  });

  it('create omits empty role/phone and always sends the trimmed location and the branch', () => {
    expect(buildUserCreate({ ...valid, phone: ' ', roleId: null, territory: ' North ', city: 'Lahore ', address: ' Mall Road' })).toEqual({
      username: 'ali.k', fullName: 'Ali', phone: undefined, territory: 'North', city: 'Lahore', address: 'Mall Road', tenantRole: TenantRole.TENANT_USER, roleId: undefined, branchId: 'b1',
    });
  });

  it('update sends only changes, null to clear the role, never a cleared branch or the username', () => {
    expect(buildUserUpdate(userDefaults(user), user)).toEqual({});
    expect(buildUserUpdate({ ...userDefaults(user), username: 'other', roleId: null, branchId: null }, user)).toEqual({ roleId: null });
    expect(buildUserUpdate({ ...userDefaults(user), branchId: 'b2' }, user)).toEqual({ branchId: 'b2' });
    expect(buildUserUpdate({ ...userDefaults(user), city: ' Karachi ', address: 'Mall Road ' }, user)).toEqual({ city: 'Karachi' });
    // A user created before the location fields existed: filling them in sends them.
    const legacy = { ...user, territory: undefined, city: undefined, address: undefined } as unknown as User;
    expect(buildUserUpdate({ ...userDefaults(legacy), territory: 'T', city: 'C', address: 'A' }, legacy)).toEqual({ territory: 'T', city: 'C', address: 'A' });
    expect(buildUserUpdate({ ...userDefaults(user), tenantRole: TenantRole.TENANT_SUPER_ADMIN, roleId: null }, user)).toEqual({ tenantRole: TenantRole.TENANT_SUPER_ADMIN, roleId: null });
    const noRole = { ...user, roleId: undefined };
    expect(buildUserUpdate(userDefaults(noRole), noRole)).toEqual({});
  });
});

describe('permission schema', () => {
  const valid = { key: 'custom:approve', name: 'Approve', module: 'custom' };
  it('requires a module:action key (backend regex)', () => {
    for (const bad of ['custom', 'Custom:read', 'custom:Read', '1x:read', 'custom:', 'custom:a']) {
      expect(firstError(permissionSchema.safeParse({ ...valid, key: bad }))).toBe('Key must be like "module:action"');
    }
    for (const ok of ['custom:approve', 'acc2:read-all', 'ab:cd:ef-g']) expect(permissionSchema.safeParse({ ...valid, key: ok }).success).toBe(true);
    expect(firstError(permissionSchema.safeParse({ ...valid, module: 'x' }))).toBe('Module must be at least 2 characters');
  });

  it('update never sends the key, and always sends name/description/module (backend Object.assign workaround)', () => {
    expect(buildPermissionCreate({ ...valid, description: '' })).toEqual({ ...valid, description: undefined });
    expect(buildPermissionUpdate({ ...permissionDefaults(perm), key: 'other:key' })).toEqual({ name: 'Approve', description: '', module: 'custom' });
    expect(buildPermissionUpdate({ ...permissionDefaults(perm), name: 'Approve all', description: 'd' })).toEqual({ name: 'Approve all', description: 'd', module: 'custom' });
  });
});

describe('menu picker logic (port of web MenuPicker)', () => {
  const act = (...keys: string[]) => keys.map((key) => ({ key, label: key }));
  const modules: PermissionModuleDef[] = [
    { key: 'sales', label: 'Sales', group: 'Operations', actions: act('read', 'create', 'void') },
    { key: 'acc_overview', label: 'Accounting', group: 'Accounting', actions: act('read') },
    { key: 'acc_payments', label: 'Payments', group: 'Accounting', parent: 'acc_overview', actions: act('read', 'create') },
    { key: 'users', label: 'Users', group: 'Users & Settings', actions: act('read', 'update') },
  ];

  it('a menu is on when its :read key is held', () => {
    expect(isMenuOn(modules[0], new Set(['sales:create']))).toBe(false);
    expect(isMenuOn(modules[0], new Set(['sales:read']))).toBe(true);
  });

  it('ticking a menu adds every action; unticking removes them all and keeps other keys', () => {
    expect(toggleMenu(['custom:x'], modules, modules[0], true).sort()).toEqual(['custom:x', 'sales:create', 'sales:read', 'sales:void']);
    expect(toggleMenu(['custom:x', ...keysOf(modules[0])], modules, modules[0], false)).toEqual(['custom:x']);
  });

  it('the Accounting parent toggles its sub-pages; a sub-page toggles only itself', () => {
    expect(toggleMenu([], modules, modules[1], true).sort()).toEqual(['acc_overview:read', 'acc_payments:create', 'acc_payments:read']);
    expect(toggleMenu([], modules, modules[2], true).sort()).toEqual(['acc_payments:create', 'acc_payments:read']);
    expect(toggleMenu(['acc_overview:read', 'acc_payments:read', 'acc_payments:create'], modules, modules[1], false)).toEqual([]);
  });

  it('select all, groups in order, and the key count', () => {
    const all = setMenus([], modules, true);
    expect(allMenusOn(modules, new Set(all))).toBe(true);
    expect(allMenusOn([], new Set(all))).toBe(false);
    expect(setMenus(all, modules, false)).toEqual([]);
    expect(menuGroups(modules)).toEqual(['Operations', 'Accounting', 'Users & Settings']);
    expect(moduleCount(['a:read', 'a:create'])).toBe(2);
  });
});
