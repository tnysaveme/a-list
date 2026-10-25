'use client';
import { useEffect, useRef, type ReactNode } from 'react';
export function Dialog({
  children,
  onClose,
  label,
  className = '',
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    dialog
      .querySelector<HTMLButtonElement>('[data-autofocus]:not(:disabled)')
      ?.focus({ preventScroll: true });
    const before = document.body.style.overflow;
    document.body.style.overflow = 'clip';
    return () => {
      dialog.close();
      document.body.style.overflow = before;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      className={`dialog ${className}`}
      onClose={(e) => {
        if (!e.currentTarget.open) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-inner">{children}</div>
    </dialog>
  );
}
