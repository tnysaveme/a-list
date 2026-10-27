import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Movie } from '../lib/model';
registerHooks({
  resolve(specifier, context, next) {
    // Next's image bundler interop is unrelated to these save/remove controls.
    if (specifier === 'next/image')
      return {
        url: `data:text/javascript,${encodeURIComponent('export default function Image(){return null;}')}`,
        shortCircuit: true,
      };
    return specifier.endsWith('.css')
      ? { url: 'data:text/javascript,export{}', shortCircuit: true }
      : next(specifier, context);
  },
});
const { MovieDetails } = await import('../components/movie-details');
const series: Movie = {
  id: '123',
  title: 'A Series',
  mediaType: 'series',
  year: '2026',
  poster: '',
  source: 'https://example.com',
  checkedAt: '2026-10-25T00:00:00Z',
  releases: [],
};
const props = {
  movie: series,
  saved: false,
  ready: true,
  busy: false,
  loading: false,
  error: '',
  onSave: () => {},
  onRemove: () => {},
  onClose: () => {},
};
test('series details disable saving and explain the movie-only scope', () => {
  const html = renderToStaticMarkup(createElement(MovieDetails, props));
  assert.match(html, /<button[^>]*class="film-control film-save"[^>]*disabled=""/);
  assert.match(html, /Movies only/);
  assert.match(html, /TV series are not supported/);
  const film = renderToStaticMarkup(
    createElement(MovieDetails, { ...props, movie: { ...series, mediaType: 'movie' } }),
  );
  assert.doesNotMatch(film, /<button[^>]*class="film-control film-save"[^>]*disabled/);
  assert.match(film, /Save to library/);
});
test('a previously saved series remains removable', () => {
  const html = renderToStaticMarkup(createElement(MovieDetails, { ...props, saved: true }));
  assert.match(html, /remove from library/);
  assert.doesNotMatch(html, /<button[^>]*class="film-control film-saved"[^>]*disabled/);
});
test('unresolved film matches explain verification instead of claiming that no date has been announced', () => {
  const html = renderToStaticMarkup(
    createElement(MovieDetails, {
      ...props,
      movie: { ...series, mediaType: 'movie', releaseLookupStatus: 'unresolved' },
    }),
  );
  assert.match(html, /TBA/);
  assert.match(html, /film identity could not be verified/);
  assert.doesNotMatch(html, /Date not announced|No US digital or subscription date is listed yet/);
});
