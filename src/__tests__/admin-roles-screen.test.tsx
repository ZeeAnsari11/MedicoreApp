import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { RolesScreen } from '@/features/roles/roles-screen';
import { confirmAction } from '@/lib/confirm';
import { createHarness, disabled, makeUser } from '@/test-support/screen-harness';
import { TenantRole } from '@/types/medicore';

// babel-jest hoists these above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn() }));
jest.setTimeout(20000);
configure({ asyncUtilTimeout: 5000 });

const h = createHarness();
const confirmMock = confirmAction as jest.Mock;
const ALL = ['roles:read', 'roles:create', 'roles:update', 'roles:delete'];
const a = (...keys: string[]) => keys.map((key) => ({ key, label: key }));
const modules = [
  { key: 'sales', label: 'Sales', group: 'Operations', actions: a('read', 'create') },
  { key: 'acc_overview', label: 'Accounting', group: 'Accounting', actions: a('read') },
  { key: 'acc_payments', label: 'Payments', group: 'Accounting', parent: 'acc_overview', actions: a('read', 'void') },
];
const rows = () => [
  { id: 'r1', tenantId: 't1', name: 'Cashier', description: 'Front desk', allowedModules: ['sales:read', 'sales:create'], isActive: true },
  { id: 'r2', tenantId: 't1', name: 'Viewer', allowedModules: [], isActive: false },
];

beforeEach(() => {
  h.reset();
  mockPush.mockClear();
  confirmMock.mockReset().mockResolvedValue(true);
  h.routes['GET /roles'] = () => ({ body: rows() });
  h.routes['GET /permissions/modules'] = () => ({ body: { modules, templates: [] } });
});
afterEach(() => h.settle());

describe('RolesScreen access and states', () => {
  it('shows "No access" and loads nothing without roles:read', async () => {
    h.me = makeUser(['users:read']);
    await h.wrap(<RolesScreen />);
    expect(await screen.findByText('No access')).toBeTruthy();
    expect(h.callsTo('GET', '/roles')).toHaveLength(0);
  });

  it('shows an error with retry when /auth/me fails', async () => {
    h.routes['GET /auth/me'] = () => ({ status: 500, body: { message: 'down' } });
    await h.wrap(<RolesScreen />);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByText('No access')).toBeNull();
  });

  it('empty and error states', async () => {
    h.me = makeUser(ALL);
    h.routes['GET /roles'] = () => ({ status: 500, body: { message: 'boom' } });
    await h.wrap(<RolesScreen />);
    expect(await screen.findByText("Couldn't load this")).toBeTruthy();
    h.routes['GET /roles'] = () => ({ body: [] });
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No roles yet')).toBeTruthy();
  });

  it('lists description, key count and status; no role is locked as "system"', async () => {
    h.me = makeUser(ALL);
    await h.wrap(<RolesScreen />);
    await screen.findByText('Cashier');
    expect(screen.getByText('Front desk')).toBeTruthy();
    expect(screen.getByText('2 module(s)')).toBeTruthy();
    expect(screen.getByText('0 module(s)')).toBeTruthy();
    expect(screen.getByText('Inactive')).toBeTruthy();
    for (const d of screen.getAllByRole('button', { name: 'Delete' })) expect(disabled(d)).toBe(false);
  });
});

describe('RolesScreen permissions', () => {
  it('read-only: New disabled, no Edit, switches and Delete disabled, no catalog link', async () => {
    h.me = makeUser(['roles:read']);
    await h.wrap(<RolesScreen />);
    await screen.findByText('Cashier');
    expect(disabled(screen.getByRole('button', { name: 'New Role' }))).toBe(true);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    for (const s of screen.getAllByLabelText('Active')) expect(s.props.disabled).toBe(true);
    for (const d of screen.getAllByRole('button', { name: 'Delete' })) expect(disabled(d)).toBe(true);
    expect(screen.queryByRole('button', { name: 'Permissions catalog' })).toBeNull();
  });

  it('the catalog link needs permissions:read and opens the catalog', async () => {
    h.me = makeUser(['roles:read', 'permissions:read']);
    await h.wrap(<RolesScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Permissions catalog' }));
    expect(mockPush).toHaveBeenCalledWith('/administration/permissions');
  });

  it('an admin gets every action', async () => {
    h.me = makeUser([], { tenantRole: TenantRole.TENANT_SUPER_ADMIN });
    await h.wrap(<RolesScreen />);
    await screen.findByText('Cashier');
    expect(disabled(screen.getByRole('button', { name: 'New Role' }))).toBe(false);
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Permissions catalog' })).toBeTruthy();
  });
});

describe('RolesScreen create / edit with the menu picker', () => {
  beforeEach(() => { h.me = makeUser(ALL); });

  it('creates a role: the Accounting parent ticks its sub-pages, every action key is sent', async () => {
    h.routes['POST /roles'] = (c) => ({ status: 201, body: { id: 'r3', tenantId: 't1', isActive: true, ...(c.body as object) } });
    await h.wrap(<RolesScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'New Role' }));
    expect(screen.getByText('Create Role')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Accounts');
    await fireEvent(await screen.findByLabelText('Accounting'), 'valueChange', true);
    expect(screen.getByLabelText('Payments').props.value).toBe(true);
    expect(screen.getByLabelText('Sales').props.value).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.callsTo('POST', '/roles')).toHaveLength(1));
    const body = h.callsTo('POST', '/roles')[0].body as { name: string; allowedModules: string[] };
    expect(body.name).toBe('Accounts');
    expect([...body.allowedModules].sort()).toEqual(['acc_overview:read', 'acc_payments:read', 'acc_payments:void']);
    expect(h.toastTexts()).toContain('Role created successfully');
  });

  it('"Select all menus" ticks every menu', async () => {
    h.routes['POST /roles'] = (c) => ({ status: 201, body: { id: 'r3', isActive: true, ...(c.body as object) } });
    await h.wrap(<RolesScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'New Role' }));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'All');
    await fireEvent(await screen.findByLabelText('Select all menus'), 'valueChange', true);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.callsTo('POST', '/roles')).toHaveLength(1));
    expect((h.callsTo('POST', '/roles')[0].body as { allowedModules: string[] }).allowedModules).toHaveLength(5);
  });

  it('a menu-catalogue load failure shows retry inside the dialog', async () => {
    h.routes['GET /permissions/modules'] = () => ({ status: 500, body: { message: 'boom' } });
    await h.wrap(<RolesScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'New Role' }));
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('edit always sends allowedModules and only the changed name; unticking removes every key', async () => {
    h.routes['PATCH /roles/r1'] = (c) => ({ body: { ...rows()[0], ...(c.body as object) } });
    await h.wrap(<RolesScreen />);
    await screen.findByText('Cashier');
    await fireEvent.press(screen.getAllByRole('button', { name: 'Edit' })[0]);
    expect(screen.getByText('Edit Role')).toBeTruthy();
    const sales = await screen.findByLabelText('Sales');
    expect(sales.props.value).toBe(true);
    await fireEvent(sales, 'valueChange', false);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.callsTo('PATCH', '/roles/r1')).toHaveLength(1));
    expect(h.callsTo('PATCH', '/roles/r1')[0].body).toEqual({ allowedModules: [] });
  });

  it('a duplicate name keeps the dialog open with the server text', async () => {
    h.routes['POST /roles'] = () => ({ status: 409, body: { message: 'A role named "Cashier" already exists' } });
    await h.wrap(<RolesScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'New Role' }));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Cashier');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('A role named "Cashier" already exists')).toBeTruthy();
    expect(screen.getByText('Create Role')).toBeTruthy();
  });

  it('double-tapping Save sends one request', async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    h.routes['POST /roles'] = (c) => ({ status: 201, body: { id: 'r3', isActive: true, ...(c.body as object) }, gate });
    await h.wrap(<RolesScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'New Role' }));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Twice');
    const save = screen.getByRole('button', { name: 'Save' });
    await fireEvent.press(save);
    await fireEvent.press(save);
    release();
    await waitFor(() => expect(screen.queryByText('Create Role')).toBeNull());
    expect(h.callsTo('POST', '/roles')).toHaveLength(1);
  });
});

describe('RolesScreen status and delete', () => {
  beforeEach(() => { h.me = makeUser(ALL); });

  it('activating an inactive role confirms then PATCHes status', async () => {
    h.routes['PATCH /roles/r2/status'] = (c) => ({ body: { ...rows()[1], ...(c.body as object) } });
    await h.wrap(<RolesScreen />);
    await screen.findByText('Viewer');
    await fireEvent(screen.getAllByLabelText('Active')[1], 'valueChange', true);
    await waitFor(() => expect(h.callsTo('PATCH', '/roles/r2/status')).toHaveLength(1));
    expect(h.callsTo('PATCH', '/roles/r2/status')[0].body).toEqual({ isActive: true });
    await waitFor(() => expect(h.toastTexts()).toContain('Role activated'));
  });

  it('an in-use delete shows the server message once (web shows two toasts) and keeps the row', async () => {
    const msg = 'This role is assigned to 3 user(s). Please reassign them or deactivate this role instead.';
    h.routes['DELETE /roles/r1'] = () => ({ status: 409, body: { message: msg } });
    await h.wrap(<RolesScreen />);
    await screen.findByText('Cashier');
    await fireEvent.press(screen.getAllByRole('button', { name: 'Delete' })[0]);
    await waitFor(() => expect(h.toastTexts()).toEqual([msg]));
    expect(confirmMock.mock.calls[0][0]).toMatchObject({ message: 'Are you sure you want to delete this role?', destructive: true });
    expect(screen.getByText('Cashier')).toBeTruthy();
  });

  it('deletes after confirmation', async () => {
    h.routes['DELETE /roles/r2'] = () => ({ status: 204 });
    await h.wrap(<RolesScreen />);
    await screen.findByText('Viewer');
    await fireEvent.press(screen.getAllByRole('button', { name: 'Delete' })[1]);
    await waitFor(() => expect(screen.queryByText('Viewer')).toBeNull());
    expect(h.toastTexts()).toContain('Role deleted successfully');
  });

  it('cancelled confirmation sends nothing', async () => {
    confirmMock.mockResolvedValue(false);
    await h.wrap(<RolesScreen />);
    await screen.findByText('Viewer');
    await fireEvent.press(screen.getAllByRole('button', { name: 'Delete' })[1]);
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(h.calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });
});
