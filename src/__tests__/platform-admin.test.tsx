import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';

import AppLayout from '@/app/(app)/_layout';
import { useSessionStore } from '@/store/session';
import { createHarness, makeUser } from '@/test-support/screen-harness';
import { SystemRole, TenantRole } from '@/types/medicore';

// babel-jest hoists these above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
// The pharmacy navigator renders as a marker, so the test can tell whether any tenant screen is reachable.
jest.mock('expo-router', () => {
  const { createElement } = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  const Stack = Object.assign(() => createElement(Text, null, 'pharmacy navigator'), { Screen: () => null });
  return { Stack, router: { replace: jest.fn(), push: jest.fn() } };
});
jest.setTimeout(20000);
configure({ asyncUtilTimeout: 5000 });

const h = createHarness();
beforeEach(h.reset);
afterEach(() => h.settle());

const superAdmin = makeUser([], { username: 'admin@gmail.com', tenantRole: TenantRole.TENANT_SUPER_ADMIN, systemRole: SystemRole.SUPER_ADMIN, branchId: undefined });

describe('platform super admin (same rule as the web shell)', () => {
  it('sees no pharmacy screens, only the web-only notice', async () => {
    h.me = superAdmin;
    await h.wrap(<AppLayout />);
    expect(await screen.findByText('Platform administration')).toBeTruthy();
    expect(screen.getByText(/admin@gmail.com is the platform super admin account/)).toBeTruthy();
    expect(screen.queryByText('pharmacy navigator')).toBeNull();
  });

  it('can sign out from there', async () => {
    h.me = superAdmin;
    await h.wrap(<AppLayout />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(useSessionStore.getState().token).toBeNull());
  });

  it('a pharmacy admin (tenant super admin) still gets the pharmacy app', async () => {
    h.me = makeUser([], { tenantRole: TenantRole.TENANT_SUPER_ADMIN });
    await h.wrap(<AppLayout />);
    expect(await screen.findByText('pharmacy navigator')).toBeTruthy();
    expect(screen.queryByText('Platform administration')).toBeNull();
  });
});
