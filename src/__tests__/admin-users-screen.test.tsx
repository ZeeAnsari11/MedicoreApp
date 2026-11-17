import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

import { UsersScreen } from '@/features/users/users-screen';
import { confirmAction } from '@/lib/confirm';
import { useToastStore } from '@/store/toast';
import { createHarness, disabled, makeUser } from '@/test-support/screen-harness';
import { TenantRole } from '@/types/medicore';

// babel-jest hoists these above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.setTimeout(20000);
configure({ asyncUtilTimeout: 5000 });

const h = createHarness();
const confirmMock = confirmAction as jest.Mock;
const ALL = ['users:read', 'users:create', 'users:update', 'users:deactivate', 'roles:read', 'branches:read'];
const ROLE_LABEL = 'User Role (controls which menus this user can see)';
const roles = [
  { id: 'r1', tenantId: 't1', name: 'Cashier', allowedModules: [], isActive: true },
  { id: 'r2', tenantId: 't1', name: 'Old Role', allowedModules: [], isActive: false },
];
const branchRows = [
  { id: 'b1', tenantId: 't1', name: 'Main', code: 'M', isMain: true, isActive: true },
  { id: 'b2', tenantId: 't1', name: 'North', code: 'N', isMain: false, isActive: true },
  { id: 'b3', tenantId: 't1', name: 'Closed', code: 'C', isMain: false, isActive: false },
];
const LOC = { territory: 'North', city: 'Lahore', address: 'Mall Road' };
const rows = () => [
  { id: 'u1', tenantId: 't1', username: 'owner', fullName: 'Owner Admin', status: 'ACTIVE', tenantRole: TenantRole.TENANT_SUPER_ADMIN, branchId: 'b1', ...LOC },
  { id: 'u2', tenantId: 't1', username: 'ali', fullName: 'Ali Khan', phone: '0300', status: 'ACTIVE', tenantRole: TenantRole.TENANT_USER, roleId: 'r1', role: { id: 'r1', name: 'Cashier' }, branchId: 'b2', ...LOC },
  { id: 'u3', tenantId: 't1', username: 'sara', fullName: 'Sara Old', status: 'DISABLED', tenantRole: TenantRole.TENANT_USER, roleId: 'r2', branchId: 'b3', ...LOC },
];

beforeEach(() => {
  h.reset();
  confirmMock.mockReset().mockResolvedValue(true);
  (Clipboard.setStringAsync as jest.Mock).mockClear();
  h.routes['GET /users'] = () => ({ body: rows() });
  h.routes['GET /roles'] = () => ({ body: roles });
  h.routes['GET /branches'] = () => ({ body: branchRows });
});
afterEach(() => h.settle());

async function openNew() {
  await fireEvent.press(await screen.findByRole('button', { name: 'New User' }));
  expect(screen.getByText('Create User')).toBeTruthy();
}
async function pick(comboLabel: string, option: string) {
  await fireEvent.press(screen.getByLabelText(comboLabel));
  await fireEvent.press(await screen.findByText(option));
}

describe('UsersScreen access and states', () => {
  it('shows "No access" without users:read and loads nothing', async () => {
    h.me = makeUser(['roles:read']);
    await h.wrap(<UsersScreen />);
    expect(await screen.findByText('No access')).toBeTruthy();
    expect(h.callsTo('GET', '/users')).toHaveLength(0);
  });

  it('empty and error-with-retry states', async () => {
    h.me = makeUser(ALL);
    h.routes['GET /users'] = () => ({ status: 500, body: { message: 'boom' } });
    await h.wrap(<UsersScreen />);
    expect(await screen.findByText("Couldn't load this")).toBeTruthy();
    h.routes['GET /users'] = () => ({ body: [] });
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No users yet')).toBeTruthy();
  });

  it('lists tenant role, status, phone and assigned role (from the row or the roles list)', async () => {
    h.me = makeUser(ALL);
    await h.wrap(<UsersScreen />);
    await screen.findByText('Ali Khan');
    expect(screen.getByText('Admin')).toBeTruthy();
    expect(screen.getByText('DISABLED')).toBeTruthy();
    expect(screen.getByText('Phone: 0300')).toBeTruthy();
    expect(screen.getByText('Role: Cashier')).toBeTruthy();
    expect(await screen.findByText('Role: Old Role')).toBeTruthy();
  });

  it('does not load roles/branches without roles:read / branches:read', async () => {
    h.me = makeUser(['users:read', 'users:create']);
    await h.wrap(<UsersScreen />);
    await screen.findByText('Ali Khan');
    await openNew();
    expect(h.callsTo('GET', '/roles')).toHaveLength(0);
    expect(h.callsTo('GET', '/branches')).toHaveLength(0);
  });
});

describe('UsersScreen permissions', () => {
  it('read-only: New disabled, no Edit, status switches disabled', async () => {
    h.me = makeUser(['users:read']);
    await h.wrap(<UsersScreen />);
    await screen.findByText('Ali Khan');
    expect(disabled(screen.getByRole('button', { name: 'New User' }))).toBe(true);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    for (const s of screen.getAllByLabelText('Active')) expect(s.props.disabled).toBe(true);
  });

  it('the status switch is gated by users:deactivate, not users:update', async () => {
    h.me = makeUser(['users:read', 'users:deactivate']);
    await h.wrap(<UsersScreen />);
    await screen.findByText('Ali Khan');
    for (const s of screen.getAllByLabelText('Active')) expect(s.props.disabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('there is no delete action (web has none)', async () => {
    h.me = makeUser([...ALL, 'users:delete']);
    await h.wrap(<UsersScreen />);
    await screen.findByText('Ali Khan');
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});

/** Location fields and the branch the API requires on create (Main = b1). */
async function fillRequired() {
  await fireEvent.changeText(screen.getByLabelText('Territory'), LOC.territory);
  await fireEvent.changeText(screen.getByLabelText('City'), LOC.city);
  await fireEvent.changeText(screen.getByLabelText('Address'), LOC.address);
  await pick('Branch', 'Main (Main)');
}

describe('UsersScreen create', () => {
  beforeEach(() => { h.me = makeUser(ALL); });

  it('validates username locally', async () => {
    await h.wrap(<UsersScreen />);
    await openNew();
    await fireEvent.changeText(screen.getByLabelText('Username'), 'ali khan');
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Ali');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Only letters, numbers, dots, dashes and underscores')).toBeTruthy();
    expect(h.callsTo('POST', '/users')).toHaveLength(0);
  });

  it('requires territory, city, address and a branch before sending', async () => {
    await h.wrap(<UsersScreen />);
    await openNew();
    await fireEvent.changeText(screen.getByLabelText('Username'), 'zara');
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Zara Ali');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    for (const msg of ['Territory is required', 'City is required', 'Address is required', 'Branch is required']) expect(await screen.findByText(msg)).toBeTruthy();
    expect(h.callsTo('POST', '/users')).toHaveLength(0);
  });

  it('offers only active roles and branches', async () => {
    await h.wrap(<UsersScreen />);
    await openNew();
    await fireEvent.press(screen.getByLabelText(ROLE_LABEL));
    expect(await screen.findByText('Cashier')).toBeTruthy();
    expect(screen.queryByText('Old Role')).toBeNull();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Close' }).at(-1)!);
    await fireEvent.press(screen.getByLabelText('Branch'));
    expect(await screen.findByText('North')).toBeTruthy();
    expect(screen.getByText('Main (Main)')).toBeTruthy();
    expect(screen.queryByText('Closed')).toBeNull();
  });

  it('creates with role and branch, then shows the temporary password once and never caches it', async () => {
    h.routes['POST /users'] = (c) => ({ status: 201, body: { id: 'u9', tenantId: 't1', status: 'ACTIVE', ...(c.body as object), temporaryPassword: 'Tmp#Pass1234' } });
    await h.wrap(<UsersScreen />);
    await openNew();
    await fireEvent.changeText(screen.getByLabelText('Username'), 'zara');
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Zara Ali');
    await fireEvent.changeText(screen.getByLabelText('Territory'), ' North ');
    await fireEvent.changeText(screen.getByLabelText('City'), 'Lahore');
    await fireEvent.changeText(screen.getByLabelText('Address'), 'Mall Road');
    await pick(ROLE_LABEL, 'Cashier');
    await pick('Branch', 'North');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.callsTo('POST', '/users')).toHaveLength(1));
    expect(h.callsTo('POST', '/users')[0].body).toEqual({ username: 'zara', fullName: 'Zara Ali', ...LOC, tenantRole: TenantRole.TENANT_USER, roleId: 'r1', branchId: 'b2' });

    expect(await screen.findByText('User Created Successfully')).toBeTruthy();
    expect(screen.getByLabelText('Temporary password').props.children).toBe('Tmp#Pass1234');
    await fireEvent.press(screen.getByRole('button', { name: 'Copy password' }));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('Tmp#Pass1234');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
    expect(useToastStore.getState().toasts.some((t) => t.text.includes('Tmp#Pass1234'))).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('Tmp#Pass1234')).toBeNull();
    expect(screen.getByText('Zara Ali')).toBeTruthy();
  });

  it('choosing Admin clears and disables the role picker and sends no roleId', async () => {
    h.routes['POST /users'] = (c) => ({ status: 201, body: { id: 'u9', status: 'ACTIVE', ...(c.body as object), temporaryPassword: 'x' } });
    await h.wrap(<UsersScreen />);
    await openNew();
    await fireEvent.changeText(screen.getByLabelText('Username'), 'boss');
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Big Boss');
    await fillRequired();
    await pick(ROLE_LABEL, 'Cashier');
    await fireEvent.press(screen.getByLabelText('Tenant Role: Admin'));
    const role = screen.getByLabelText('User Role (Not applicable for Admin)');
    expect(disabled(role)).toBe(true);
    expect(screen.getByText('Admin has access to all menus')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.callsTo('POST', '/users')).toHaveLength(1));
    expect(h.callsTo('POST', '/users')[0].body).toEqual({ username: 'boss', fullName: 'Big Boss', ...LOC, tenantRole: TenantRole.TENANT_SUPER_ADMIN, branchId: 'b1' });
  });

  it('a duplicate username keeps the dialog open with the server text; no password dialog', async () => {
    const msg = 'A user with this username already exists in this organization.';
    h.routes['POST /users'] = () => ({ status: 409, body: { message: msg } });
    await h.wrap(<UsersScreen />);
    await openNew();
    await fireEvent.changeText(screen.getByLabelText('Username'), 'ali');
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Ali 2');
    await fillRequired();
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(msg)).toBeTruthy();
    expect(screen.getByText('Create User')).toBeTruthy();
    expect(screen.queryByText('User Created Successfully')).toBeNull();
  });

  it('double-tapping Save creates one user', async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    h.routes['POST /users'] = (c) => ({ status: 201, body: { id: 'u9', status: 'ACTIVE', ...(c.body as object), temporaryPassword: 'x' }, gate });
    await h.wrap(<UsersScreen />);
    await openNew();
    await fireEvent.changeText(screen.getByLabelText('Username'), 'twice');
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Two Taps');
    await fillRequired();
    const save = screen.getByRole('button', { name: 'Save' });
    await fireEvent.press(save);
    await fireEvent.press(save);
    release();
    expect(await screen.findByText('User Created Successfully')).toBeTruthy();
    expect(h.callsTo('POST', '/users')).toHaveLength(1);
  });
});

describe('UsersScreen edit', () => {
  beforeEach(() => { h.me = makeUser(ALL); });

  it('username is locked; clearing the role sends null; the branch can be changed but not cleared', async () => {
    h.routes['PATCH /users/u2'] = (c) => ({ body: { ...rows()[1], ...(c.body as object), role: null } });
    await h.wrap(<UsersScreen />);
    await screen.findByText('Ali Khan');
    await fireEvent.press(screen.getAllByRole('button', { name: 'Edit' })[1]);
    expect(screen.getByText('Edit User')).toBeTruthy();
    expect(screen.getByLabelText('Username').props.editable).toBe(false);
    await fireEvent.press(screen.getByLabelText(ROLE_LABEL));
    await fireEvent.press(await screen.findByText('Clear selection'));
    await fireEvent.press(screen.getByLabelText('Branch'));
    expect(screen.queryByText('Clear selection')).toBeNull();
    await fireEvent.press(await screen.findByText('Main (Main)'));
    await fireEvent.changeText(screen.getByLabelText('City'), 'Karachi');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.callsTo('PATCH', '/users/u2')).toHaveLength(1));
    expect(h.callsTo('PATCH', '/users/u2')[0].body).toEqual({ city: 'Karachi', roleId: null, branchId: 'b1' });
    expect(h.toastTexts()).toContain('User updated successfully');
  });

  it('an inactive role/branch already assigned is shown (marked inactive), and saving untouched sends nothing for it', async () => {
    h.routes['PATCH /users/u3'] = (c) => ({ body: { ...rows()[2], ...(c.body as object) } });
    await h.wrap(<UsersScreen />);
    await screen.findByText('Sara Old');
    await fireEvent.press(screen.getAllByRole('button', { name: 'Edit' })[2]);
    expect(await screen.findByText('Old Role (inactive)')).toBeTruthy();
    expect(await screen.findByText('Closed (inactive)')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Sara New');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.callsTo('PATCH', '/users/u3')).toHaveLength(1));
    expect(h.callsTo('PATCH', '/users/u3')[0].body).toEqual({ fullName: 'Sara New' });
  });

  it.each([
    'You cannot change your own access level',
    'You cannot change your own role',
    'Cannot demote the last active admin of this organization',
  ])('shows the backend self/last-admin rule verbatim: %s', async (msg) => {
    h.routes['PATCH /users/u1'] = () => ({ status: 409, body: { message: msg } });
    await h.wrap(<UsersScreen />);
    await screen.findByText('Owner Admin');
    await fireEvent.press(screen.getAllByRole('button', { name: 'Edit' })[0]);
    await fireEvent.press(screen.getByLabelText('Tenant Role: User'));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(msg)).toBeTruthy();
    expect(screen.getByText('Edit User')).toBeTruthy();
  });
});

describe('UsersScreen status', () => {
  beforeEach(() => { h.me = makeUser(ALL); });

  it('disables after a destructive confirmation', async () => {
    h.routes['PATCH /users/u2/status'] = (c) => ({ body: { ...rows()[1], ...(c.body as object) } });
    await h.wrap(<UsersScreen />);
    await screen.findByText('Ali Khan');
    await fireEvent(screen.getAllByLabelText('Active')[1], 'valueChange', false);
    await waitFor(() => expect(h.callsTo('PATCH', '/users/u2/status')).toHaveLength(1));
    expect(confirmMock.mock.calls[0][0]).toMatchObject({ title: 'Disable user?', destructive: true });
    expect(h.callsTo('PATCH', '/users/u2/status')[0].body).toEqual({ status: 'DISABLED' });
    await waitFor(() => expect(h.toastTexts()).toContain('User disabled'));
  });

  it('reactivates a disabled user', async () => {
    h.routes['PATCH /users/u3/status'] = (c) => ({ body: { ...rows()[2], ...(c.body as object) } });
    await h.wrap(<UsersScreen />);
    await screen.findByText('Sara Old');
    await fireEvent(screen.getAllByLabelText('Active')[2], 'valueChange', true);
    await waitFor(() => expect(h.callsTo('PATCH', '/users/u3/status')[0]?.body).toEqual({ status: 'ACTIVE' }));
    await waitFor(() => expect(h.toastTexts()).toContain('User active'));
  });

  it('self-deactivation is refused by the backend and shown verbatim', async () => {
    h.routes['PATCH /users/u1/status'] = () => ({ status: 409, body: { message: 'You cannot deactivate your own account' } });
    await h.wrap(<UsersScreen />);
    await screen.findByText('Owner Admin');
    await fireEvent(screen.getAllByLabelText('Active')[0], 'valueChange', false);
    await waitFor(() => expect(h.toastTexts()).toEqual(['You cannot deactivate your own account']));
  });

  it('cancelled confirmation sends nothing; a second toggle while one is pending is ignored', async () => {
    let resolveConfirm: (v: boolean) => void = () => {};
    confirmMock.mockImplementation(() => new Promise((r) => { resolveConfirm = r; }));
    await h.wrap(<UsersScreen />);
    await screen.findByText('Ali Khan');
    await fireEvent(screen.getAllByLabelText('Active')[1], 'valueChange', false);
    await fireEvent(screen.getAllByLabelText('Active')[1], 'valueChange', false);
    resolveConfirm(false);
    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    expect(h.calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });
});
