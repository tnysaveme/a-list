import test from 'node:test';
import assert from 'node:assert/strict';
import { requestApi, ApiTimeoutError } from '../lib/client-api';
import { applyLibraryBatch } from '../lib/library-batch';

test('read deadlines and caller cancellation have distinct outcomes, without automatic retries', async () => {
  const previous = globalThis.fetch;
  const keepAlive = setInterval(() => {}, 100);
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const signal = init!.signal!;
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  };
  try {
    await assert.rejects(requestApi('library', undefined, undefined, 10), ApiTimeoutError);
    const controller = new AbortController();
    const pending = requestApi('library', undefined, controller.signal, 1000);
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = previous;
    clearInterval(keepAlive);
  }
});

test('HTML outage responses have actionable copy instead of a JSON parse error', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html>Bad gateway</html>', { status: 502 });
  try {
    await assert.rejects(requestApi('library'), /temporarily unavailable/);
  } finally {
    globalThis.fetch = previous;
  }
});

test('a committed write whose response times out is reconciled without issuing it again', async () => {
  const previous = globalThis.fetch;
  const keepAlive = setInterval(() => {}, 100);
  let saved = false,
    writes = 0;
  globalThis.fetch = async (_url, init) => {
    if (init?.method === 'POST') {
      saved = true;
      writes++;
      return new Promise<Response>((_resolve, reject) =>
        init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true }),
      );
    }
    return Response.json({ membership: { '1': saved } });
  };
  try {
    const result = await applyLibraryBatch('add', ['1'], {
      read: async () =>
        (await requestApi<{ membership: Record<string, boolean> }>('library/membership?ids=1'))
          .membership,
      write: async () => {
        await requestApi('library', { action: 'add', ids: ['1'] }, undefined, 10);
      },
    });
    assert.equal(writes, 1);
    assert.equal(result.reconciled, true);
    assert.deepEqual(result.changedIds, ['1']);
    assert.deepEqual(result.remainingIds, []);
  } finally {
    globalThis.fetch = previous;
    clearInterval(keepAlive);
  }
});

test('export deadline includes consuming a stalled response body', async () => {
  const { requestData, ApiTimeoutError } = await import('../lib/client-request');
  const previous = globalThis.fetch;
  const keepAlive = setInterval(() => {}, 100);
  globalThis.fetch = async (_url, init) =>
    new Response(
      new ReadableStream({
        start(controller) {
          init!.signal!.addEventListener('abort', () => controller.error(init!.signal!.reason), {
            once: true,
          });
        },
      }),
    );
  try {
    await assert.rejects(
      requestData('/api/account/export', { blob: true, timeoutMs: 10 }),
      ApiTimeoutError,
    );
  } finally {
    globalThis.fetch = previous;
    clearInterval(keepAlive);
  }
});

test('unreadable successful mutations are uncertain but rejected validation is safe to correct', async () => {
  const { requestData, RequestError } = await import('../lib/client-request');
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return calls === 1
      ? new Response('<html>Response lost</html>')
      : Response.json({ error: 'Type RESET to confirm' }, { status: 400 });
  };
  try {
    await assert.rejects(
      requestData('/api/account/reset-calendar', { body: {} }),
      (error: unknown) => error instanceof RequestError && error.uncertain,
    );
    await assert.rejects(
      requestData('/api/account/reset-calendar', { body: {} }),
      (error: unknown) => error instanceof RequestError && !error.uncertain && error.status === 400,
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = previous;
  }
});

test('successful JSON and blob bodies cannot publish after caller cancellation', async () => {
  const { requestData } = await import('../lib/client-request');
  const previous = globalThis.fetch;
  try {
    for (const blob of [false, true]) {
      const controller = new AbortController();
      globalThis.fetch = async () => {
        const response = Response.json({ membership: { '1': true } });
        if (blob)
          response.blob = async () => {
            controller.abort();
            return new Blob(['late export']);
          };
        else
          response.json = async () => {
            controller.abort();
            return { membership: { '1': true } };
          };
        return response;
      };
      await assert.rejects(requestData('/api/fixture', { signal: controller.signal, blob }), {
        name: 'AbortError',
      });
    }
  } finally {
    globalThis.fetch = previous;
  }
});
