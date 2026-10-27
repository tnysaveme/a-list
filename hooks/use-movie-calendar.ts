'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getApi, postApi } from '../lib/client-api';
import type { Movie } from '../lib/model';

export function useMovieCalendar(
  notify: (message: string, error?: boolean) => void,
  onPreferenceChange?: () => Promise<unknown>,
) {
  const [calendar, setCalendar] = useState(false),
    [feedPath, setFeedPath] = useState(''),
    [feedPublic, setFeedPublic] = useState(false),
    [includeRumors, setIncludeRumors] = useState(true),
    [copied, setCopied] = useState(false),
    [settingsBusy, setSettingsBusy] = useState(false);
  const [tracked, setTracked] = useState<Movie[]>([]),
    [trackedNext, setTrackedNext] = useState<number | null>(null),
    [trackedBusy, setTrackedBusy] = useState(false);
  const request = useRef(0),
    copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );
  const configure = useCallback(
    (data: { feedPath: string; feedPublic: boolean; includeRumors: boolean }) => {
      setFeedPath(data.feedPath);
      setFeedPublic(data.feedPublic);
      setIncludeRumors(data.includeRumors);
    },
    [],
  );
  const loadTracked = useCallback(
    async (offset = 0) => {
      const current = ++request.current;
      controller.current?.abort();
      controller.current = new AbortController();
      setTrackedBusy(true);
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
          notify((error as Error).message, true);
      } finally {
        if (current === request.current) setTrackedBusy(false);
      }
    },
    [notify],
  );
  const openCalendar = useCallback(() => {
    setCalendar(true);
    void loadTracked();
  }, [loadTracked]);
  const updateRumors = useCallback(
    async (value: boolean) => {
      setSettingsBusy(true);
      try {
        await postApi('settings', { includeRumors: value });
        setIncludeRumors(value);
        await onPreferenceChange?.();
      } catch (error) {
        notify((error as Error).message, true);
      } finally {
        setSettingsBusy(false);
      }
    },
    [notify, onPreferenceChange],
  );
  const resetFeed = useCallback((path: string) => {
    setFeedPath(path);
    setCopied(false);
  }, []);
  const download = useCallback(() => {
    if (!feedPath) return;
    const anchor = document.createElement('a');
    anchor.href = feedPath;
    anchor.download = 'a-list.ics';
    anchor.click();
  }, [feedPath]);
  const copyFeed = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(new URL(feedPath, window.location.origin).href);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      notify('Could not copy the calendar link. Please try again.', true);
    }
  }, [feedPath, notify]);
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
    configure,
    loadTracked,
    openCalendar,
    updateRumors,
    resetFeed,
    download,
    copyFeed,
  };
}
