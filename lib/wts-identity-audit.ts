import { automaticEvidence, UnresolvedRelease } from './release-automation';
import { evidenceAgreement, type SourceProfile } from './release-profile';
import type { MetadataEvidence } from './metadata';

/** Public film facts only. These gaps describe evidence; no individual gap alone
 * determines failure, because different strict corroboration paths are allowed. */
export function identityAuditEvidence(profile: SourceProfile, candidates: MetadataEvidence[]) {
  return candidates.map((candidate) => {
    const agreement = evidenceAgreement(profile, candidate);
    let qualifies = false;
    try {
      qualifies = automaticEvidence(profile, [candidate]).movie.id === candidate.movie.id;
    } catch (error) {
      if (!(error instanceof UnresolvedRelease)) throw error;
    }
    return {
      id: candidate.movie.id,
      title: candidate.movie.title,
      year: candidate.movie.year,
      qualifies,
      primaryIdentityVerified: candidate.primaryIdentityVerified === true,
      agreement: { ...agreement, cast: agreement.cast.length },
      evidenceGaps: [
        ...(!agreement.title ? ['title_mismatch'] : []),
        ...(!agreement.year ? ['year_difference'] : []),
        ...(!agreement.director ? ['director_mismatch'] : []),
        ...(agreement.cast.length < 2 ? ['sparse_shared_cast'] : []),
        ...(!agreement.synopsis ? ['synopsis_not_exact'] : []),
        ...(!agreement.runtime ? ['runtime_unconfirmed'] : []),
        ...(!agreement.theatrical ? ['theatrical_unconfirmed'] : []),
        ...(candidate.movie.mediaType === 'series' || profile.facts?.series ? ['not_movie'] : []),
      ],
    };
  });
}
