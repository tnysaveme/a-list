'use client';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useExitContent, useExitPresence } from '../hooks/use-exit-presence';
import { Drawer } from 'vaul';

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
  swipeToClose = false,
}: {
  children: ReactNode;
  open?: boolean;
  onClose: () => void;
  onAfterClose?: () => void;
  label?: string;
  labelledBy?: string;
  busy?: boolean;
  className?: string;
  swipeToClose?: boolean;
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
  const dialog = (
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
      {swipeToClose && <Drawer.Handle className="dialog-drag-handle" preventCycle />}
      <div className="dialog-inner">{content}</div>
      <div className="dialog-mobile-actions">
        <button className="button subtle" disabled={busy || !open} onClick={onClose}>
          Done
        </button>
      </div>
    </dialog>
  );
  if (!swipeToClose) return dialog;
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
      modal={false}
      noBodyStyles
      handleOnly
      dismissible={!busy}
      repositionInputs={false}
    >
      <Drawer.Title className="sr-only">{label || 'Film details'}</Drawer.Title>
      <Drawer.Content
        asChild
        forceMount
        aria-describedby={undefined}
        data-vaul-animate="false"
        onCloseAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          if (!busy) onClose();
        }}
      >
        {dialog}
      </Drawer.Content>
    </Drawer.Root>
  );
}
