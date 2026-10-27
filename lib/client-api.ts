export async function requestApi<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const write = body !== undefined;
  const response = await fetch(`/api/${path}`, {
    method: write ? 'POST' : 'GET',
    headers: write ? { 'Content-Type': 'application/json' } : undefined,
    body: write ? JSON.stringify(body) : undefined,
    signal,
  });
  if (response.status === 401) window.location.replace(new URL('/login', window.location.origin));
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || 'Could not complete this request.');
  return data;
}

import type { GetPath, GetResponse, PostRequests, PostResponses } from './api-contract';
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
