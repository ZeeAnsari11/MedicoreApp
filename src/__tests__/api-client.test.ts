import { apiFetch, setSessionExpiredHandler } from '@/api/client';
import { ApiError, NetworkError, TimeoutError } from '@/api/errors';
import { useBranchStore } from '@/store/branch';
import { useSessionStore } from '@/store/session';

// babel-jest hoists this above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 50 }));

const jsonResponse = (status: number, body?: unknown) =>
  ({ ok: status >= 200 && status < 300, status, statusText: 'x', json: async () => body }) as unknown as Response;

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  useSessionStore.setState({ token: 'tok', impersonationToken: null });
  useBranchStore.setState({ selection: null });
  setSessionExpiredHandler(null);
});

const lastHeaders = () => fetchMock.mock.calls[0][1].headers as Record<string, string>;

describe('apiFetch', () => {
  it('sends the Bearer token and returns parsed JSON', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: 1 }));
    await expect(apiFetch('/x')).resolves.toEqual({ ok: 1 });
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/x');
    expect(lastHeaders().Authorization).toBe('Bearer tok');
  });

  it('prefers the impersonation token', async () => {
    useSessionStore.setState({ impersonationToken: 'imp' });
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await apiFetch('/x');
    expect(lastHeaders().Authorization).toBe('Bearer imp');
  });

  it('omits Authorization for auth:false (login)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await apiFetch('/auth/login', { method: 'POST', body: {}, auth: false });
    expect(lastHeaders().Authorization).toBeUndefined();
  });

  it('sends X-Branch-Id on reads but never on POST', async () => {
    useBranchStore.setState({ selection: 'b1' });
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await apiFetch('/products');
    expect(lastHeaders()['X-Branch-Id']).toBe('b1');
    fetchMock.mockClear();
    await apiFetch('/products', { method: 'POST', body: {} });
    expect(lastHeaders()['X-Branch-Id']).toBeUndefined();
  });

  it('sends no branch header for "all branches"', async () => {
    useBranchStore.setState({ selection: 'all' });
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await apiFetch('/products');
    expect(lastHeaders()['X-Branch-Id']).toBeUndefined();
  });

  it('returns undefined for 204', async () => {
    fetchMock.mockResolvedValue(jsonResponse(204));
    await expect(apiFetch('/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('joins Nest array messages into one ApiError message', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { message: ['a is required', 'b must be a number'] }));
    await expect(apiFetch('/x', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 400, message: 'a is required, b must be a number' });
  });

  it('calls the session-expired handler on 401 of an authenticated call, but not for login', async () => {
    const handler = jest.fn();
    setSessionExpiredHandler(handler);
    fetchMock.mockResolvedValue(jsonResponse(401, { message: 'Unauthorized' }));
    await expect(apiFetch('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
    await expect(apiFetch('/auth/login', { method: 'POST', body: {}, auth: false })).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('maps a fetch failure to NetworkError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(apiFetch('/x')).rejects.toBeInstanceOf(NetworkError);
  });

  it('maps a hung request to TimeoutError', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_res, rej) => {
      init.signal?.addEventListener('abort', () => rej(new Error('aborted')));
    }));
    await expect(apiFetch('/x')).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe('session store', () => {
  it('persists and clears the token in secure storage', async () => {
    await useSessionStore.getState().setToken('abc');
    expect(useSessionStore.getState().token).toBe('abc');
    await useSessionStore.getState().hydrate();
    expect(useSessionStore.getState().token).toBe('abc');
    await useSessionStore.getState().clear();
    expect(useSessionStore.getState().token).toBeNull();
    await useSessionStore.getState().hydrate();
    expect(useSessionStore.getState().token).toBeNull();
  });
});
