'use client';
import { useState, useEffect, useCallback } from 'react';
import { getApi } from '../lib/client-api';
import { sanitizeMovie, type Movie } from '../lib/model';
export function useMovieDetails(onUpdate: (movie: Movie) => void) {
  const [movie, setMovie] = useState<Movie | null>(null),
    [detailBusy, setDetailBusy] = useState(false),
    [detailError, setDetailError] = useState('');
  const movieId = movie?.id;
  useEffect(() => {
    if (!movieId) return;
    const id = movieId;
    const controller = new AbortController();
    const fetchDetails = async () => {
      let data = await getApi(`movie/${id}`, controller.signal);
      for (
        let attempt = 0;
        data.movie.refreshPending && attempt < 20 && !controller.signal.aborted;
        attempt++
      ) {
        setMovie((current) => (current?.id === id ? data.movie : current));
        await new Promise<void>((resolve, reject) => {
          const done = () => {
            controller.signal.removeEventListener('abort', abort);
            resolve();
          };
          const timer = setTimeout(done, 1500);
          const abort = () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
          };
          controller.signal.addEventListener('abort', abort, { once: true });
        });
        data = await getApi(`movie/${id}?cached=true`, controller.signal);
      }
      return data;
    };
    fetchDetails()
      .then((d) => {
        if (controller.signal.aborted) return;
        if (d.movie.refreshPending)
          setDetailError(
            'The source check is continuing in the background. Saved dates remain visible.',
          );
        setMovie((current) => (current?.id === id ? d.movie : current));
        onUpdate(d.movie);
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
    setMovie(sanitizeMovie(value));
  }, []);
  return { movie, setMovie, busy: detailBusy, error: detailError, open };
}
