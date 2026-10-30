export class RequestError extends Error {
  constructor(
    message: string,
    public readonly uncertain = false,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'RequestError';
  }
}

export class ApiTimeoutError extends RequestError {
  constructor(write = false) {
    super(
      write
        ? 'The response took too long. The change could not be confirmed.'
        : 'This request took too long. Check your connection and try again.',
      write,
    );
    this.name = 'ApiTimeoutError';
  }
}

/** Deadline includes response-body consumption. Mutations are never retried here. */
export async function requestData<T>(
  url: string,
  options: {
    body?: unknown;
    signal?: AbortSignal;
    timeoutMs?: number;
    blob?: boolean;
    readOnly?: boolean;
    redirectUnauthorized?: boolean;
  } = {},
): Promise<T> {
  const write = options.body !== undefined && !options.readOnly;
  const deadline = AbortSignal.timeout(options.timeoutMs ?? (write ? 30000 : 10000));
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  try {
    const response = await fetch(url, {
      method: options.body === undefined ? 'GET' : 'POST',
      headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    });
    if (response.status === 401 && options.redirectUnauthorized && typeof window !== 'undefined')
      window.location.replace(new URL('/login', window.location.origin));
    if (response.ok && options.blob) return (await response.blob()) as T;
    let data: T & { error?: string };
    try {
      data = await response.json();
    } catch {
      signal.throwIfAborted();
      throw new RequestError(
        response.ok
          ? 'Could not read the response. Please try again.'
          : 'The service is temporarily unavailable. Please try again.',
        write && (response.ok || response.status >= 500),
        response.status,
      );
    }
    if (!response.ok)
      throw new RequestError(
        data?.error || 'Could not complete this request.',
        write && response.status >= 500,
        response.status,
      );
    return data;
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason;
    if (deadline.aborted) throw new ApiTimeoutError(write);
    if (error instanceof TypeError)
      throw new RequestError('Could not connect. Check your connection and try again.', write);
    throw error;
  }
}
