'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getApi, postApi } from '../lib/client-api';
import type { LibraryInit } from '../lib/api-contract';
import type { Movie } from '../lib/model';

export function useMovieCalendar(
  _notify: (message: string, error?: boolean) => void,
  onPreferenceChange?: () => Promise<unknown>,
  initial?: LibraryInit | null,
) {
  const [calendar, setCalendar] = useState(false),
    [feedPath, setFeedPath] = useState(initial?.feedPath || ''),
    [feedPublic, setFeedPublic] = useState(initial?.feedPublic || false),
    [includeRumors, setIncludeRumors] = useState(initial?.includeRumors ?? true),
    [copied, setCopied] = useState(false),
    [settingsBusy, setSettingsBusy] = useState(false);
  const [trackedError, setTrackedError] = useState<{ message: string; offset: number } | null>(
    null,
  );
  const [preferenceError, setPreferenceError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [copying, setCopying] = useState(false);
  const preferenceRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const copyingRef = useRef(false);
  const [tracked, setTracked] = useState<Movie[]>([]),
    [trackedNext, setTrackedNext] = useState<number | null>(null),
    [trackedBusy, setTrackedBusy] = useState(false);
  const request = useRef(0),
    copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    controller = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      preferenceRequest.current?.abort();
      controller.current?.abort();
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);
  const configure = useCallback(
    (data: { feedPath: string; feedPublic: boolean; includeRumors: boolean }) => {
      setFeedPath(data.feedPath);
      setFeedPublic(data.feedPublic);
      setIncludeRumors(data.includeRumors);
    },
    [],
  );
  const loadTracked = useCallback(async (offset = 0) => {
    const current = ++request.current;
    controller.current?.abort();
    controller.current = new AbortController();
    setTrackedBusy(true);
    setTrackedError(null);
    try {
      const data = await getApi(
        `library?tracked=true&sort=title&offset=${offset}`,
        controller.current.signal,
      );
      if (current !== request.current) return;
      setTracked((previous) => (offset ? [...previous, ...data.movies] : data.movies));
      setTrackedNext(data.nextOffset);
    } catch (error) {
      if (current === request.current && !(error instanceof Error && error.name === 'AbortError'))
        setTrackedError({ message: (error as Error).message, offset });
    } finally {
      if (current === request.current) setTrackedBusy(false);
    }
  }, []);
  const openCalendar = useCallback(() => {
    setCalendar(true);
    void loadTracked();
  }, [loadTracked]);
  const updateRumors = useCallback(
    async (value: boolean) => {
      if (preferenceRequest.current) return;
      const pending = new AbortController();
      preferenceRequest.current = pending;
      setSettingsBusy(true);
      setPreferenceError('');
      try {
        await postApi('settings', { includeRumors: value }, pending.signal);
        pending.signal.throwIfAborted();
        setIncludeRumors(value);
        await onPreferenceChange?.();
      } catch (error) {
        if (!pending.signal.aborted) setPreferenceError((error as Error).message);
      } finally {
        preferenceRequest.current = null;
        if (!pending.signal.aborted) setSettingsBusy(false);
      }
    },
    [onPreferenceChange],
  );
  const resetFeed = useCallback((path: string) => {
    setFeedPath(path);
    setCopied(false);
    setCopyError('');
  }, []);
  const download = useCallback(() => {
    if (!feedPath) return;
    const anchor = document.createElement('a');
    anchor.href = feedPath;
    anchor.download = 'a-list.ics';
    anchor.click();
  }, [feedPath]);
  const copyFeed = useCallback(async () => {
    if (copyingRef.current || !feedPath) return;
    copyingRef.current = true;
    setCopying(true);
    setCopyError('');
    setCopied(false);
    try {
      await navigator.clipboard.writeText(new URL(feedPath, window.location.origin).href);
      if (!mounted.current) return;
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      if (mounted.current) setCopyError('Could not copy the calendar link. Please try again.');
    } finally {
      copyingRef.current = false;
      if (mounted.current) setCopying(false);
    }
  }, [feedPath]);
  return {
    calendar,
    setCalendar,
    feedPath,
    feedPublic,
    includeRumors,
    copied,
    settingsBusy,
    tracked,
    setTracked,
    trackedNext,
    trackedBusy,
    trackedError,
    preferenceError,
    copyError,
    copying,
    configure,
    loadTracked,
    openCalendar,
    updateRumors,
    resetFeed,
    download,
    copyFeed,
  };
}
