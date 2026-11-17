import { configure, screen } from '@testing-library/react-native';

import MoreScreen from '@/app/(app)/(tabs)/more';
import { navSections } from '@/navigation/nav-config';
import { createHarness, makeUser } from '@/test-support/screen-harness';
import { TenantRole } from '@/types/medicore';

// babel-jest hoists these above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() }, Link: ({ children }: { children: unknown }) => children }));
jest.setTimeout(20000);
configure({ asyncUtilTimeout: 5000 });

const h = createHarness();
beforeEach(h.reset);
afterEach(() => h.settle());

describe('Administration navigation', () => {
  it('lists Branches, Roles and Users gated by their read keys; the catalog has no menu entry (as on the web)', () => {
    const admin = navSections.find((s) => s.title === 'Administration')!;
    expect(admin.items.map((i) => [i.label, i.href, i.anyOf])).toEqual([
      ['Branches', '/administration/branches', ['branches:read']],
      ['Roles', '/administration/roles', ['roles:read']],
      ['Users', '/administration/users', ['users:read']],
    ]);
    expect(navSections.flatMap((s) => s.items).some((i) => i.href.includes('permissions'))).toBe(false);
  });

  it('shows only the admin items the user can read', async () => {
    h.me = makeUser(['users:read', 'branches:create', 'roles:update']);
    await h.wrap(<MoreScreen />);
    expect(await screen.findByText('Users')).toBeTruthy();
    expect(screen.getByText('ADMINISTRATION')).toBeTruthy();
    expect(screen.queryByText('Branches')).toBeNull();
    expect(screen.queryByText('Roles')).toBeNull();
  });

  it('hides the whole section without any admin read key', async () => {
    h.me = makeUser(['sales:read']);
    await h.wrap(<MoreScreen />);
    expect(await screen.findByText('Sales')).toBeTruthy();
    expect(screen.queryByText('ADMINISTRATION')).toBeNull();
  });

  it('a tenant admin sees every admin item', async () => {
    h.me = makeUser([], { tenantRole: TenantRole.TENANT_SUPER_ADMIN });
    await h.wrap(<MoreScreen />);
    for (const label of ['Branches', 'Roles', 'Users']) expect(await screen.findByText(label)).toBeTruthy();
  });
});
