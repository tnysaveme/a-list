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
  | `movie/${string}`
  | `library${'' | `?${string}`}`
  | `catalogue${'' | `?${string}`}`
  | `search?${string}`
  | `library/membership?${string}`;
export type GetResponse<P extends GetPath> = P extends `movie/${string}`
  ? MovieResponse
  : P extends `catalogue${string}`
    ? CataloguePage
    : P extends `library/membership?${string}`
      ? { membership: Record<string, boolean> }
      : P extends `search?${string}`
        ? { movies: Movie[] }
        : LibraryPage;
export type PostRequests = {
  init: Record<string, never>;
  library: { action: 'add' | 'remove' | 'track'; ids: string[] };
  settings: { includeRumors: boolean };
  'account/reset-calendar': { confirmation: 'RESET' };
  'account/delete': { confirmation: 'DELETE' };
};
export type PostResponses = {
  init: LibraryInit;
  library: { ok: true };
  settings: { ok: true };
  'account/reset-calendar': { feedPath: string };
  'account/delete': { deleted: true };
};
