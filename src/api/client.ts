import { API_BASE_URL, API_URL_CONFIGURED, REQUEST_TIMEOUT_MS } from '@/config/env';
import { branchHeaders } from '@/store/branch';
import { getActiveToken } from '@/store/session';

import { ApiError, NetworkError, TimeoutError } from './errors';

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  /** false for endpoints that don't need a session (login). */
  auth?: boolean;
  signal?: AbortSignal;
}

type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler | null = null;
/** Registered once by the auth layer; called on a 401 from an authenticated request. */
export const setSessionExpiredHandler = (handler: SessionExpiredHandler | null) => {
  onSessionExpired = handler;
};

async function rawFetch(path: string, options: ApiRequestOptions): Promise<Response> {
  if (!API_URL_CONFIGURED) throw new NetworkError('EXPO_PUBLIC_API_URL is not configured for this build.');
  const { method = 'GET', body, headers, auth = true, signal } = options;

  const finalHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getActiveToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
    // Same rule as the web: reads carry the branch filter; creates (POST) take their branch from the form.
    if (method !== 'POST') Object.assign(finalHeaders, branchHeaders());
  }
  Object.assign(finalHeaders, headers);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  signal?.addEventListener('abort', () => controller.abort());

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    if (controller.signal.aborted) throw new TimeoutError();
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let message: string = response.statusText;
    let errorBody: unknown;
    try {
      const data = await response.json();
      errorBody = data;
      message = data?.message ?? message;
    } catch {
      // no JSON body
    }
    if (response.status === 401 && auth) onSessionExpired?.();
    throw new ApiError(response.status, Array.isArray(message) ? message.join(', ') : message, errorBody);
  }
  return response;
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await rawFetch(path, options);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** For PDFs/CSV/XLSX: returns the raw response bytes (RN's Response.blob() is unreliable, so use arrayBuffer). */
export async function apiFetchBytes(path: string, options: ApiRequestOptions = {}): Promise<ArrayBuffer> {
  const response = await rawFetch(path, options);
  return response.arrayBuffer();
}
