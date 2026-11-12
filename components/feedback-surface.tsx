'use client';
import type { ReactNode } from 'react';
import { useExitContent, useExitPresence } from '../hooks/use-exit-presence';

export function ExitContent({ open, children }: { open: boolean; children: ReactNode }) {
  return useExitContent(children, open);
}

export function FeedbackSurface({
  open,
  className,
  role,
  children,
}: {
  open: boolean;
  className: string;
  role?: 'alert' | 'status';
  children: ReactNode;
}) {
  const { ref, mounted } = useExitPresence<HTMLDivElement>(open);
  const content = useExitContent(children, open);
  if (!mounted) return null;
  return (
    <div
      ref={ref}
      className={`${className} feedback-surface`}
      role={open ? role : undefined}
      data-state={open ? 'open' : 'closed'}
      inert={!open}
    >
      {content}
    </div>
  );
}
