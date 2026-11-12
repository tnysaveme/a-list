import test from 'node:test';
import assert from 'node:assert/strict';
import { canHover, noHover, subscribeHover } from '../lib/hover-capability';

test('hundreds of posters share one hover listener and release it on final unmount', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const listeners = new Set<() => void>();
  let queries = 0,
    attached = 0,
    removed = 0;
  const media = {
    matches: true,
    addEventListener: (event: string, listener: () => void) => {
      assert.equal(event, 'change');
      attached++;
      listeners.add(listener);
    },
    removeEventListener: (event: string, listener: () => void) => {
      assert.equal(event, 'change');
      removed++;
      listeners.delete(listener);
    },
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      matchMedia: (query: string) => {
        assert.equal(query, '(hover: hover) and (pointer: fine)');
        queries++;
        return media;
      },
    },
  });
  const cleanups: (() => void)[] = [];
  const notifications = Array<number>(200).fill(0);
  try {
    assert.equal(noHover(), false);
    assert.equal(queries, 0, 'server snapshot does not touch the browser');
    for (let i = 0; i < notifications.length; i++) {
      assert.equal(canHover(), true);
      cleanups.push(
        subscribeHover(() => {
          notifications[i]++;
        }),
      );
    }
    assert.equal(queries, 1);
    assert.equal(attached, 1);
    media.matches = false;
    for (const listener of listeners) listener();
    assert.equal(canHover(), false);
    assert.ok(notifications.every((count) => count === 1));
    for (const cleanup of cleanups.splice(0, 100)) cleanup();
    assert.equal(removed, 0);
    for (const listener of listeners) listener();
    assert.deepEqual(notifications, [...Array<number>(100).fill(1), ...Array<number>(100).fill(2)]);
    for (const cleanup of cleanups.splice(0)) cleanup();
    assert.equal(removed, 1);
    assert.equal(listeners.size, 0);
    cleanups.push(subscribeHover(() => {}));
    assert.equal(queries, 2, 'a later mount gets a fresh browser query');
    assert.equal(attached, 2);
  } finally {
    for (const cleanup of cleanups) cleanup();
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  }
  assert.equal(removed, 2);
});
