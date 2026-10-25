import {verifiedIdentityId} from './film-identity';
import {sanitizeMovie,type Movie} from './model';

/** Reuse saved native IDs only when both source identities have been verified. */
export function canonicalSearchMovie(incoming: Movie, stored: Movie): Movie {
  const incomingId = verifiedIdentityId(incoming), storedId = verifiedIdentityId(stored);
  if (incoming.id !== stored.id && (!incomingId || incomingId !== storedId)) return sanitizeMovie(incoming);
  if (incomingId && storedId && incomingId !== storedId) return sanitizeMovie(incoming);
  const newerReleases = !!incoming.releaseCheckedAt && (!stored.releaseCheckedAt || incoming.releaseCheckedAt > stored.releaseCheckedAt);
  const identity = incomingId && (!storedId || (incoming.identityVerifiedAt || '') > (stored.identityVerifiedAt || '')) ? incoming : stored;
  const repaired = !!incomingId && !!stored.imdbId && stored.imdbId !== incomingId;
  return sanitizeMovie({...incoming, ...stored,
    imdbId: identity.imdbId, identityVerifiedAt: identity.identityVerifiedAt,
    ...(newerReleases ? {releases: incoming.releases, releaseCheckedAt: incoming.releaseCheckedAt, checkedAt: incoming.checkedAt} : {}),
    overview: !repaired && stored.overview || incoming.overview,
    overviewSource: !repaired && stored.overview ? stored.overviewSource : incoming.overviewSource,
  });
}
