'use client';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useExitContent, useExitPresence } from '../hooks/use-exit-presence';

const modalLocks = new Set<HTMLDialogElement>();
let previousOverflow = '';
let returnFocus: HTMLElement | null = null;
export function Dialog({
  children,
  open = true,
  onClose,
  onAfterClose,
  label,
  labelledBy,
  busy = false,
  className = '',
}: {
  children: ReactNode;
  open?: boolean;
  onClose: () => void;
  onAfterClose?: () => void;
  label?: string;
  labelledBy?: string;
  busy?: boolean;
  className?: string;
}) {
  const { ref, mounted } = useExitPresence<HTMLDialogElement>(open, onAfterClose);
  const content = useExitContent(children, open);
  const backdropPress = useRef(false);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!mounted || !dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!modalLocks.size) {
      returnFocus = trigger;
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'clip';
    }
    modalLocks.add(dialog);
    dialog.showModal();
    dialog
      .querySelector<HTMLElement>('[data-autofocus]:not(:disabled)')
      ?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      modalLocks.delete(dialog);
      if (!modalLocks.size) {
        document.body.style.overflow = previousOverflow;
        const target =
          trigger?.isConnected && !trigger.closest('dialog:not([open])') ? trigger : returnFocus;
        if (target?.isConnected) target.focus({ preventScroll: true });
        returnFocus = null;
      }
    };
  }, [mounted, ref]);
  if (!mounted) return null;
  return (
    <dialog
      ref={ref}
      aria-label={label}
      aria-labelledby={labelledBy}
      className={`dialog ${className}`}
      data-state={open ? 'open' : 'closed'}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClose={(event) => {
        // A queued close event from cleanup must not dismiss a reopened dialog.
        if (open && !event.currentTarget.open) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && backdropPress.current && !busy) onClose();
        backdropPress.current = false;
      }}
      onPointerDown={(event) => {
        backdropPress.current = event.target === event.currentTarget;
      }}
      onPointerCancel={() => {
        backdropPress.current = false;
      }}
    >
      <div className="dialog-inner">{content}</div>
      <div className="dialog-mobile-actions">
        <button className="button subtle" disabled={busy || !open} onClick={onClose}>
          Done
        </button>
      </div>
    </dialog>
  );
}
