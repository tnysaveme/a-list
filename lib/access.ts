/** Keep private-mode access exact; explicitly enable verified email signups. */
export function emailIsAllowed(email:string|null|undefined,allowedLists:readonly (string|undefined)[],allowSignups=false):boolean {
  const normalized=email?.trim().toLowerCase();
  if(!normalized||normalized.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))return false;
  if(allowSignups)return true;
  return allowedLists.some(list=>list?.split(',').some(entry=>entry.trim().toLowerCase()===normalized));
}
