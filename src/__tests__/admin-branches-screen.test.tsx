import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { BranchesScreen } from '@/features/branches/branches-screen';
import { confirmAction } from '@/lib/confirm';
import { createHarness, disabled, makeUser } from '@/test-support/screen-harness';
import { TenantRole } from '@/types/medicore';

// babel-jest hoists these above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn() }));
jest.setTimeout(20000);
configure({ asyncUtilTimeout: 5000 });

const h = createHarness();
const confirmMock = confirmAction as jest.Mock;
const ALL = ['branches:read', 'branches:create', 'branches:update', 'branches:delete'];
const rows = () => [
  { id: 'b1', tenantId: 't1', name: 'Main', code: 'MAIN', address: 'Mall Rd', isMain: true, isActive: true },
  { id: 'b2', tenantId: 't1', name: 'North', code: 'NB', isMain: false, isActive: true },
];

beforeEach(() => {
  h.reset();
  confirmMock.mockReset().mockResolvedValue(true);
  h.routes['GET /branches'] = () => ({ body: rows() });
});
afterEach(() => h.settle());

const switches = () => screen.getAllByLabelText('Active');
const deletes = () => screen.getAllByRole('button', { name: 'Delete' });

describe('BranchesScreen access', () => {
  it('shows "No access" and loads nothing without branches:read', async () => {
    h.me = makeUser(['branches:create']);
    await h.wrap(<BranchesScreen />);
    expect(await screen.findByText('No access')).toBeTruthy();
    expect(h.callsTo('GET', '/branches')).toHaveLength(0);
  });

  it('shows Loading while /auth/me loads, then the list', async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    h.me = makeUser(ALL);
    h.routes['GET /auth/me'] = () => ({ body: h.me, gate });
    await h.wrap(<BranchesScreen />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screen.queryByText('No access')).toBeNull();
    release();
    expect(await screen.findByText('North')).toBeTruthy();
  });

  it('a tenant admin passes every check with no explicit permissions', async () => {
    h.me = makeUser([], { tenantRole: TenantRole.TENANT_SUPER_ADMIN });
    await h.wrap(<BranchesScreen />);
    await screen.findByText('North');
    expect(disabled(screen.getByRole('button', { name: 'New Branch' }))).toBe(false);
    expect(disabled(deletes()[1])).toBe(false);
  });
});

describe('BranchesScreen list states', () => {
  beforeEach(() => { h.me = makeUser(ALL); });

  it('shows an empty state', async () => {
    h.routes['GET /branches'] = () => ({ body: [] });
    await h.wrap(<BranchesScreen />);
    expect(await screen.findByText('No branches yet')).toBeTruthy();
  });

  it('shows a load error and retries', async () => {
    let fail = true;
    h.routes['GET /branches'] = () => (fail ? { status: 500, body: { message: 'boom' } } : { body: rows() });
    await h.wrap(<BranchesScreen />);
    expect(await screen.findByText("Couldn't load this")).toBeTruthy();
    fail = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('North')).toBeTruthy();
  });

  it('renders code, address, Main badge, and locks the main branch switch and delete', async () => {
    await h.wrap(<BranchesScreen />);
    await screen.findByText('North');
    expect(screen.getByText('Code: MAIN')).toBeTruthy();
    expect(screen.getByText('Address: Mall Rd')).toBeTruthy();
    expect(screen.getAllByText('Main')).toHaveLength(2); // name + Main badge
    expect(switches()[0].props.disabled).toBe(true);
    expect(disabled(deletes()[0])).toBe(true);
    expect(switches()[1].props.disabled).toBe(false);
    expect(disabled(deletes()[1])).toBe(false);
  });
});

describe('BranchesScreen permissions', () => {
  it('read-only: New disabled, no Edit, switches and Delete disabled', async () => {
    h.me = makeUser(['branches:read']);
    await h.wrap(<BranchesScreen />);
    await screen.findByText('North');
    expect(disabled(screen.getByRole('button', { name: 'New Branch' }))).toBe(true);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(switches()[1].props.disabled).toBe(true);
    expect(disabled(deletes()[1])).toBe(true);
  });

  it('branches:read via another module key is not enough for the screen (purchases:create)', async () => {
    h.me = makeUser(['purchases:create']);
    await h.wrap(<BranchesScreen />);
    expect(await screen.findByText('No access')).toBeTruthy();
  });
});

describe('BranchesScreen create / edit', () => {
  beforeEach(() => { h.me = makeUser(ALL); });

  it('validates locally, then POSTs with an uppercased code and closes on success', async () => {
    h.routes['POST /branches'] = (c) => ({ status: 201, body: { id: 'b3', tenantId: 't1', isActive: true, isMain: false, ...(c.body as object) } });
    await h.wrap(<BranchesScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'New Branch' }));
    expect(screen.getByText('Create Branch')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Name is required')).toBeTruthy();
    expect(h.callsTo('POST', '/branches')).toHaveLength(0);

    await fireEvent.changeText(screen.getByLabelText('Name'), 'South');
    await fireEvent.changeText(screen.getByLabelText('Code'), 'sb');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.callsTo('POST', '/branches')).toHaveLength(1));
    expect(h.callsTo('POST', '/branches')[0].body).toEqual({ name: 'South', code: 'SB' });
    await waitFor(() => expect(screen.queryByText('Create Branch')).toBeNull());
    expect(h.toastTexts()).toContain('Branch created successfully');
    expect(screen.getByText('South')).toBeTruthy();
  });

  it('keeps the dialog open with the exact 409 message on a duplicate code', async () => {
    h.routes['POST /branches'] = () => ({ status: 409, body: { message: 'A branch with code "NB" already exists' } });
    await h.wrap(<BranchesScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'New Branch' }));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'North 2');
    await fireEvent.changeText(screen.getByLabelText('Code'), 'NB');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    // Shown inside the dialog (the toast host is not rendered here) and as a toast.
    expect(await screen.findByText('A branch with code "NB" already exists')).toBeTruthy();
    expect(h.toastTexts()).toContain('A branch with code "NB" already exists');
    expect(screen.getByText('Create Branch')).toBeTruthy();
  });

  it('ignores a double tap on Save while the request is in flight', async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    h.routes['POST /branches'] = (c) => ({ status: 201, body: { id: 'b3', isActive: true, isMain: false, ...(c.body as object) }, gate });
    await h.wrap(<BranchesScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'New Branch' }));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'South');
    await fireEvent.changeText(screen.getByLabelText('Code'), 'SB');
    const save = screen.getByRole('button', { name: 'Save' });
    await fireEvent.press(save);
    await fireEvent.press(save);
    await fireEvent.press(save);
    release();
    await waitFor(() => expect(screen.queryByText('Create Branch')).toBeNull());
    expect(h.callsTo('POST', '/branches')).toHaveLength(1);
  });

  it('edit PATCHes only the changed fields', async () => {
    h.routes['PATCH /branches/b2'] = (c) => ({ body: { ...rows()[1], ...(c.body as object) } });
    await h.wrap(<BranchesScreen />);
    await screen.findByText('North');
    await fireEvent.press(screen.getAllByRole('button', { name: 'Edit' })[1]);
    expect(screen.getByText('Edit Branch')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Address'), 'GT Rd');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.callsTo('PATCH', '/branches/b2')).toHaveLength(1));
    expect(h.callsTo('PATCH', '/branches/b2')[0].body).toEqual({ address: 'GT Rd' });
    expect(h.toastTexts()).toContain('Branch updated successfully');
  });

  it('making a branch main refetches the list so the old main loses its badge', async () => {
    h.routes['PATCH /branches/b2'] = () => ({ body: { ...rows()[1], isMain: true } });
    await h.wrap(<BranchesScreen />);
    await screen.findByText('North');
    const before = h.callsTo('GET', '/branches').length;
    await fireEvent.press(screen.getAllByRole('button', { name: 'Edit' })[1]);
    await fireEvent(screen.getByLabelText('Main branch'), 'valueChange', true);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.callsTo('PATCH', '/branches/b2')[0]?.body).toEqual({ isMain: true }));
    await waitFor(() => expect(h.callsTo('GET', '/branches').length).toBeGreaterThan(before));
  });
});

describe('BranchesScreen status and delete', () => {
  beforeEach(() => { h.me = makeUser(ALL); });

  it('deactivates after confirmation', async () => {
    h.routes['PATCH /branches/b2/status'] = (c) => ({ body: { ...rows()[1], ...(c.body as object) } });
    await h.wrap(<BranchesScreen />);
    await screen.findByText('North');
    await fireEvent(switches()[1], 'valueChange', false);
    await waitFor(() => expect(h.callsTo('PATCH', '/branches/b2/status')).toHaveLength(1));
    expect(confirmMock.mock.calls[0][0]).toMatchObject({ title: 'Deactivate branch?' });
    expect(h.callsTo('PATCH', '/branches/b2/status')[0].body).toEqual({ isActive: false });
    await waitFor(() => expect(h.toastTexts()).toContain('Branch deactivated'));
  });

  it('cancelling the confirmation sends nothing', async () => {
    confirmMock.mockResolvedValue(false);
    await h.wrap(<BranchesScreen />);
    await screen.findByText('North');
    await fireEvent(switches()[1], 'valueChange', false);
    await fireEvent.press(deletes()[1]);
    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(2));
    expect(h.calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });

  it('deletes after a destructive confirmation and removes the row', async () => {
    h.routes['DELETE /branches/b2'] = () => ({ status: 204 });
    await h.wrap(<BranchesScreen />);
    await screen.findByText('North');
    await fireEvent.press(deletes()[1]);
    await waitFor(() => expect(h.callsTo('DELETE', '/branches/b2')).toHaveLength(1));
    expect(confirmMock.mock.calls[0][0]).toMatchObject({ message: 'Are you sure you want to delete this branch?', destructive: true });
    await waitFor(() => expect(screen.queryByText('North')).toBeNull());
    expect(h.toastTexts()).toContain('Branch deleted successfully');
  });

  it('shows the backend 409 verbatim when the branch is in use, and keeps the row', async () => {
    h.routes['DELETE /branches/b2'] = () => ({ status: 409, body: { message: 'This branch is assigned to 2 user(s). Please reassign them first.' } });
    await h.wrap(<BranchesScreen />);
    await screen.findByText('North');
    await fireEvent.press(deletes()[1]);
    await waitFor(() => expect(h.toastTexts()).toEqual(['This branch is assigned to 2 user(s). Please reassign them first.']));
    expect(screen.getByText('North')).toBeTruthy();
  });

  it('shows a 403 from the backend verbatim (the server stays authoritative)', async () => {
    h.routes['DELETE /branches/b2'] = () => ({ status: 403, body: { message: 'Insufficient permissions' } });
    await h.wrap(<BranchesScreen />);
    await screen.findByText('North');
    await fireEvent.press(deletes()[1]);
    await waitFor(() => expect(h.toastTexts()).toContain('Insufficient permissions'));
  });

  it('a second tap while a delete is in flight is ignored', async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    h.routes['DELETE /branches/b2'] = () => ({ status: 204, gate });
    await h.wrap(<BranchesScreen />);
    await screen.findByText('North');
    await fireEvent.press(deletes()[1]);
    await fireEvent.press(deletes()[1]);
    release();
    await waitFor(() => expect(screen.queryByText('North')).toBeNull());
    expect(h.callsTo('DELETE', '/branches/b2')).toHaveLength(1);
  });
});
