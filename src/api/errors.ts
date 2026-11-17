export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** No HTTP response: offline, DNS/TLS failure, server unreachable. The request may or may not have reached the server. */
export class NetworkError extends Error {
  constructor(message = 'Cannot reach the server. Check your internet connection and try again.') {
    super(message);
    this.name = 'NetworkError';
  }
}

/** Sent but timed out before a response. For a write, the server may still have processed it. */
export class TimeoutError extends Error {
  constructor(message = 'The server took too long to respond.') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}
