import { ApiError, NetworkError, TimeoutError } from '@/api/errors';

/** Message for a failed write. A timeout is called out because the server may still have processed the request. */
export function mutationErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof TimeoutError) return 'The server took too long to respond. Check the list before trying again: it may have been saved.';
  if (error instanceof ApiError || error instanceof NetworkError) return error.message;
  return fallback;
}
