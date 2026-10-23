/** Exact, case-insensitive email matching; an empty list always denies access. */
export function emailIsAllowed(email:string|null|undefined,allowedLists:readonly (string|undefined)[]):boolean {
  const normalized=email?.trim().toLowerCase();
  if(!normalized)return false;
  return allowedLists.some(list=>list?.split(',').some(entry=>entry.trim().toLowerCase()===normalized));
}
