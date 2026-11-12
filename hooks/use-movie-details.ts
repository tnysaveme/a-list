'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { waitForForeground } from '../lib/foreground';
import { getApi } from '../lib/client-api';
import { sanitizeMovie, type Movie } from '../lib/model';

type MembershipState = { saved: boolean; watchedAt?: string | null };
function withMembership(value: Movie, state: MembershipState): Movie {
  const watchedAt = state.saved
    ? state.watchedAt === undefined
      ? value.watchedAt
      : state.watchedAt
    : null;
  return { ...value, saved: state.saved, tracked: state.saved && !watchedAt, watchedAt };
}

export function useMovieDetails(onUpdate: (movie: Movie) => void) {
  const [movie, setMovie] = useState<Movie | null>(null),
    [detailBusy, setDetailBusy] = useState(false),
    [detailError, setDetailError] = useState('');
  const movieId = movie?.id;
  const membershipVersion = useRef(0);
  const membership = useRef(
    new Map<string, { saved: boolean; watchedAt?: string | null; version: number }>(),
  );
  const recordMembership = useCallback((values: Record<string, boolean>) => {
    const version = ++membershipVersion.current;
    for (const [id, saved] of Object.entries(values))
      membership.current.set(id, {
        ...membership.current.get(id),
        saved,
        ...(!saved ? { watchedAt: null } : {}),
        version,
      });
  }, []);
  const recordWatched = useCallback((values: Record<string, string | null>) => {
    const version = ++membershipVersion.current;
    for (const [id, watchedAt] of Object.entries(values))
      membership.current.set(id, { saved: true, watchedAt, version });
  }, []);
  useEffect(() => {
    if (!movieId) return;
    const id = movieId;
    const controller = new AbortController();
    const read = async (path: `movie/${string}`) => {
      const version = membershipVersion.current;
      const data = await getApi(path, controller.signal);
      return { ...data, version };
    };
    const protect = (value: Movie, version: number) => {
      const latest = membership.current.get(value.id);
      return latest && latest.version > version ? withMembership(value, latest) : value;
    };
    const snapshot = (value: Movie) => ({ movie: value, version: membershipVersion.current });
    const reconcile = async (value: Movie, version: number) => {
      const latest = membership.current.get(value.id);
      if (!latest) return snapshot(value);
      if (latest.version > version) return snapshot(withMembership(value, latest));
      if (
        latest.saved === value.saved &&
        (latest.watchedAt === undefined || (latest.watchedAt || null) === (value.watchedAt || null))
      )
        return snapshot(value);
      // Metadata responses are not allowed to contradict a confirmed write on their own.
      // Recheck account state so genuine changes in another tab can still be accepted.
      const checkedAt = membershipVersion.current;
      try {
        const state = await getApi(
          `library/membership?ids=${encodeURIComponent(value.id)}`,
          controller.signal,
        );
        controller.signal.throwIfAborted();
        const current = membership.current.get(value.id);
        if (current && current.version > checkedAt) return snapshot(withMembership(value, current));
        if (
          typeof state.membership[value.id] !== 'boolean' ||
          !Object.hasOwn(state.watched, value.id)
        )
          throw new Error('Incomplete saved state');
        const confirmed = {
          saved: state.membership[value.id],
          watchedAt: state.membership[value.id] ? state.watched[value.id] : null,
          version: ++membershipVersion.current,
        };
        membership.current.set(value.id, confirmed);
        return snapshot(withMembership(value, confirmed));
      } catch {
        controller.signal.throwIfAborted();
        setDetailError('Could not refresh saved status. Showing your last confirmed state.');
        return snapshot(withMembership(value, membership.current.get(value.id) || latest));
      }
    };
    const fetchDetails = async () => {
      let data = await read(`movie/${id}`);
      let published: Movie | null = null;
      for (
        let attempt = 0;
        data.movie.refreshPending && attempt < 20 && !controller.signal.aborted;
        attempt++
      ) {
        const reconciled = await reconcile(data.movie, data.version);
        controller.signal.throwIfAborted();
        const value = protect(reconciled.movie, reconciled.version);
        setMovie((current) => (current?.id === id ? value : current));
        // Account state is ready even while the source metadata is still refreshing.
        if (
          !published ||
          published.saved !== value.saved ||
          (published.watchedAt || null) !== (value.watchedAt || null)
        ) {
          onUpdate(value);
          published = value;
        }
        await waitForForeground(controller.signal, 1500, () =>
          setDetailError('You’re offline. Showing saved information until the connection returns.'),
        );
        setDetailError('');
        data = await read(`movie/${id}?cached=true`);
      }
      return data;
    };
    fetchDetails()
      .then(async (d) => {
        if (controller.signal.aborted) return;
        if (d.movie.refreshPending)
          setDetailError(
            'The source check is continuing in the background. Saved dates remain visible.',
          );
        const reconciled = await reconcile(d.movie, d.version);
        if (controller.signal.aborted) return;
        const value = protect(reconciled.movie, reconciled.version);
        setMovie((current) => (current?.id === id ? value : current));
        onUpdate(value);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setDetailError(
            'The source could not be refreshed. Showing the last checked information.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailBusy(false);
      });
    return () => controller.abort();
  }, [movieId, onUpdate]);

  const open = useCallback((value: Movie) => {
    setDetailBusy(true);
    setDetailError('');
    const latest = membership.current.get(value.id);
    setMovie(sanitizeMovie(latest ? withMembership(value, latest) : value));
  }, []);
  return {
    movie,
    setMovie,
    busy: detailBusy,
    error: detailError,
    open,
    recordMembership,
    recordWatched,
  };
}
