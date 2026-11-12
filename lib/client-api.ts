import type { GetPath, GetResponse, PostRequests, PostResponses } from './api-contract';
import { requestData } from './client-request';
export { ApiTimeoutError } from './client-request';

export async function requestApi<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  timeoutMs = body === undefined || path === 'init'
    ? path.startsWith('search?')
      ? 15000
      : 10000
    : 30000,
): Promise<T> {
  return requestData<T>(`/api/${path}`, {
    body,
    signal,
    timeoutMs,
    readOnly: path === 'init',
    redirectUnauthorized: true,
  });
}

export function getApi<P extends GetPath>(path: P, signal?: AbortSignal) {
  return requestApi<GetResponse<P>>(path, undefined, signal);
}
export function postApi<P extends keyof PostRequests>(
  path: P,
  body: PostRequests[P],
  signal?: AbortSignal,
) {
  return requestApi<PostResponses[P]>(path, body, signal);
}
