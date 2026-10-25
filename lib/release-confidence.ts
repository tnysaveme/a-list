import type { Release } from './model';

/** Confidence describes the source's wording, not whether the date is in the past. */
export function releaseConfidence(wording: string): Release['confidence'] {
  return /\b(?:expected|estimated?|tentative|unconfirmed|rumou?red)\b|not (?:yet )?confirmed|according to (?:our|their) sources|neither announced/i.test(
    wording,
  )
    ? 'rumored'
    : 'listed';
}
