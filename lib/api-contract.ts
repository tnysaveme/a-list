import type { ReleaseHistoryEntry } from './release-history';
import type { Movie } from './model';
import type { CataloguePage } from './catalogue-view';
import type { LibraryPage } from './pagination';
export type LibraryInit = LibraryPage & {
  feedPath: string;
  feedPublic: boolean;
  includeRumors: boolean;
};
export type MovieResponse = { movie: Movie };
export type GetPath =
  | 'revision'
  | `movie/${string}/history`
  | `movie/${string}`
  | `library${'' | `?${string}`}`
  | `catalogue${'' | `?${string}`}`
  | `search?${string}`
  | `library/membership?${string}`;
export type GetResponse<P extends GetPath> = P extends 'revision'
  ? { revision: string }
  : P extends `movie/${string}/history`
    ? { entries: ReleaseHistoryEntry[] }
    : P extends `movie/${string}`
      ? MovieResponse
      : P extends `catalogue${string}`
        ? CataloguePage
        : P extends `library/membership?${string}`
          ? { membership: Record<string, boolean>; watched: Record<string, string | null> }
          : P extends `search?${string}`
            ? { movies: Movie[] }
            : LibraryPage;
export type PostRequests = {
  init: Record<string, never>;
  library: {
    action: 'add' | 'remove' | 'track' | 'watch' | 'unwatch';
    ids: string[];
    watchedAt?: Record<string, string | null>;
  };
  settings: { includeRumors: boolean };
  'account/reset-calendar': { confirmation: 'RESET' };
  'account/delete': { confirmation: 'DELETE' };
};
export type PostResponses = {
  init: LibraryInit;
  library: {
    ok: true;
    watched?: Record<string, string | null>;
    membership?: Record<string, boolean>;
  };
  settings: { ok: true };
  'account/reset-calendar': { feedPath: string };
  'account/delete': { deleted: true };
};
