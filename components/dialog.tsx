'use client';
import { useLayoutEffect, type ReactNode } from 'react';
import { useExitContent, useExitPresence } from '../hooks/use-exit-presence';

const modalLocks = new Set<HTMLDialogElement>();
let previousOverflow = '';
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
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!mounted || !dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!modalLocks.size) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'clip';
    }
    modalLocks.add(dialog);
    dialog.showModal();
    dialog
      .querySelector<HTMLButtonElement>('[data-autofocus]:not(:disabled)')
      ?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      modalLocks.delete(dialog);
      if (!modalLocks.size) {
        document.body.style.overflow = previousOverflow;
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
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
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="dialog-inner">{content}</div>
    </dialog>
  );
}
