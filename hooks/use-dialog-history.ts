'use client';
import { useId, useLayoutEffect, useRef } from 'react';

type Entry = { close: () => void; busy: boolean; closing?: boolean };
const entries = new Map<string, Entry>();
const key = 'alistDialog';
let listening = false;
let scheduled = false;
let consumingBack = false;
const handled = new WeakSet<Event>();
export function isDialogNavigation(event: Event) {
  return handled.has(event) || consumingBack || entries.size > 0;
}

function reconcile() {
  scheduled = false;
  const current = [...entries].filter(([, entry]) => !entry.closing).at(-1);
  if (current) {
    if (history.state?.[key] === current[0]) return;
    const state = { ...history.state, [key]: current[0] };
    // A handoff replaces the sheet entry; it must not leave an orphan behind.
    if (history.state?.[key]) history.replaceState(state, '');
    else history.pushState(state, '');
  } else if (history.state?.[key] && !consumingBack) {
    consumingBack = true;
    history.back();
  }
}
function schedule() {
  if (!scheduled) {
    scheduled = true;
    queueMicrotask(reconcile);
  }
}
function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener(
    'popstate',
    (event) => {
      if (consumingBack) {
        handled.add(event);
        consumingBack = false;
        event.stopImmediatePropagation();
        return;
      }
      const current = [...entries].filter(([, entry]) => !entry.closing).at(-1);
      if (!current) {
        // A Forward entry cannot reopen an already-disposed sheet. Keep the
        // collection navigation usable without propagating a stale modal marker.
        if (event.state?.[key]) {
          const state = { ...event.state };
          delete state[key];
          history.replaceState(state, '');
        }
        return;
      }
      if (event.state?.[key] === current[0]) {
        handled.add(event);
        event.stopImmediatePropagation();
        return;
      }
      event.stopImmediatePropagation();
      handled.add(event);
      if (current[1].busy) {
        history.forward();
        return;
      }
      current[1].closing = true;
      current[1].close();
    },
    true,
  );
}

/** One history entry for the active modal, including Calendar → film handoffs. */
export function useDialogHistory(open: boolean, onClose: () => void, busy: boolean) {
  const id = useId();
  const latest = useRef({ onClose, busy });
  useLayoutEffect(() => {
    latest.current = { onClose, busy };
    const entry = entries.get(id);
    if (entry) entry.busy = busy;
  });
  useLayoutEffect(() => {
    if (!open) return;
    listen();
    entries.set(id, { close: () => latest.current.onClose(), busy: latest.current.busy });
    schedule();
    return () => {
      entries.delete(id);
      schedule();
    };
  }, [id, open]);
}
