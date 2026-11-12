'use client';
import { memo } from 'react';
import { CircleHelp, LoaderCircle, Plus } from 'lucide-react';

/** Stable icon layers let confirmation reverse without remounting or replaying on initial load. */
export const MembershipIcon = memo(function MembershipIcon({
  saved,
  pending = false,
  optimistic = false,
  unknown = false,
  size = 18,
}: {
  saved: boolean;
  pending?: boolean;
  optimistic?: boolean;
  unknown?: boolean;
  size?: number;
}) {
  const waiting = pending && !optimistic;
  const state = waiting ? 'pending' : unknown ? 'unknown' : saved ? 'saved' : 'unsaved';
  return (
    <span
      className="membership-icon"
      data-membership={state}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Plus className="membership-add" size={size} />
      <svg
        className="membership-check"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m20 6-11 11-5-5" pathLength="1" />
      </svg>
      {waiting && <LoaderCircle className="membership-pending spin" size={size} />}
      {unknown && !pending && <CircleHelp className="membership-unknown" size={size} />}
    </span>
  );
});
