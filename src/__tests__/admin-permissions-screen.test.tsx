import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { PermissionsScreen } from '@/features/permissions/permissions-screen';
import { createHarness, disabled, makeUser } from '@/test-support/screen-harness';

// babel-jest hoists these above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.setTimeout(20000);
configure({ asyncUtilTimeout: 5000 });

const h = createHarness();
const ALL = ['permissions:read', 'permissions:create', 'permissions:update'];
// The real backend sends `_id` and no `id` for permissions (see use-permission-catalog.ts).
const rows = () => [
  { _id: 'p1', tenantId: null, key: 'users:read', name: 'View users', module: 'users', isSystem: true, isActive: true },
  { _id: 'p2', tenantId: 't1', key: 'custom:approve', name: 'Approve', description: 'Sign off', module: 'custom', isSystem: false, isActive: true },
];

beforeEach(() => {
  h.reset();
  h.routes['GET /permissions'] = () => ({ body: rows() });
});
afterEach(() => h.settle());

describe('PermissionsScreen', () => {
  it('shows "No access" without permissions:read', async () => {
    h.me = makeUser(['roles:read']);
    await h.wrap(<PermissionsScreen />);
    expect(await screen.findByText('No access')).toBeTruthy();
    expect(h.callsTo('GET', '/permissions')).toHaveLength(0);
  });

  it('empty and error-with-retry states', async () => {
    h.me = makeUser(ALL);
    h.routes['GET /permissions'] = () => ({ status: 500, body: { message: 'boom' } });
    await h.wrap(<PermissionsScreen />);
    expect(await screen.findByText("Couldn't load this")).toBeTruthy();
    h.routes['GET /permissions'] = () => ({ body: [] });
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No permissions yet')).toBeTruthy();
  });

  it('lists key, scope and status; Edit only on custom rows with permissions:update', async () => {
    h.me = makeUser(ALL);
    await h.wrap(<PermissionsScreen />);
    await screen.findByText('users:read');
    expect(screen.getByText('System')).toBeTruthy();
    expect(screen.getByText('Custom')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'View' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
  });

  it('read-only users can view but not create or edit', async () => {
    h.me = makeUser(['permissions:read']);
    await h.wrap(<PermissionsScreen />);
    await screen.findByText('users:read');
    expect(disabled(screen.getByRole('button', { name: 'New Permission' }))).toBe(true);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('viewing a system permission is read-only with the web note and no Save', async () => {
    h.me = makeUser(ALL);
    await h.wrap(<PermissionsScreen />);
    await screen.findByText('users:read');
    await fireEvent.press(screen.getAllByRole('button', { name: 'View' })[0]);
    expect(screen.getByText('View Permission')).toBeTruthy();
    expect(screen.getByText('System permissions cannot be edited')).toBeTruthy();
    for (const f of ['Key', 'Name', 'Description', 'Module']) expect(screen.getByLabelText(f).props.editable).toBe(false);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('creates a custom permission after local key validation', async () => {
    h.me = makeUser(ALL);
    h.routes['POST /permissions'] = (c) => ({ status: 201, body: { _id: 'p3', tenantId: 't1', isSystem: false, isActive: true, ...(c.body as object) } });
    await h.wrap(<PermissionsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'New Permission' }));
    expect(screen.getByText('Create Permission')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Key'), 'Reports');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Export all');
    await fireEvent.changeText(screen.getByLabelText('Module'), 'reports');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Key must be like "module:action"')).toBeTruthy();
    expect(h.callsTo('POST', '/permissions')).toHaveLength(0);
    await fireEvent.changeText(screen.getByLabelText('Key'), 'reports:export-all');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.callsTo('POST', '/permissions')).toHaveLength(1));
    expect(h.callsTo('POST', '/permissions')[0].body).toEqual({ key: 'reports:export-all', name: 'Export all', module: 'reports' });
    expect(await screen.findByText('reports:export-all')).toBeTruthy();
  });

  it('a duplicate key keeps the dialog open with the server text', async () => {
    const msg = 'A permission with key "custom:approve" already exists in this organization';
    h.me = makeUser(ALL);
    h.routes['POST /permissions'] = () => ({ status: 409, body: { message: msg } });
    await h.wrap(<PermissionsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'New Permission' }));
    await fireEvent.changeText(screen.getByLabelText('Key'), 'custom:approve');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Approve');
    await fireEvent.changeText(screen.getByLabelText('Module'), 'custom');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(msg)).toBeTruthy();
    expect(screen.getByText('Create Permission')).toBeTruthy();
  });

  it('edit locks the key and PATCHes name, description and module together', async () => {
    h.me = makeUser(ALL);
    h.routes['PATCH /permissions/p2'] = (c) => ({ body: { ...rows()[1], ...(c.body as object) } });
    await h.wrap(<PermissionsScreen />);
    await screen.findByText('custom:approve');
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByText('Edit Permission')).toBeTruthy();
    expect(screen.getByLabelText('Key').props.editable).toBe(false);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Approve orders');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.callsTo('PATCH', '/permissions/p2')).toHaveLength(1));
    expect(h.callsTo('PATCH', '/permissions/p2')[0].body).toEqual({ name: 'Approve orders', description: 'Sign off', module: 'custom' });
  });

  it('a 404 from the backend (foreign or system id) is shown verbatim', async () => {
    const msg = 'Permission not found or does not belong to your organization';
    h.me = makeUser(ALL);
    h.routes['PATCH /permissions/p2'] = () => ({ status: 404, body: { message: msg } });
    await h.wrap(<PermissionsScreen />);
    await screen.findByText('custom:approve');
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Approve orders');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(msg)).toBeTruthy();
  });
});
