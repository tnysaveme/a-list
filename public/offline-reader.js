import { readOfflineLibrary, clearOfflineLibrary } from './offline-store.js';
function applyTheme() {
  let theme;
  try {
    theme = localStorage.getItem('a-list:appearance:v1');
  } catch {
    /* Follow the device. */
  }
  if (theme !== 'light' && theme !== 'dark')
    theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]'))
    meta.content = theme === 'dark' ? '#161719' : '#ffffff';
}
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
window.addEventListener('storage', applyTheme);
const films = document.getElementById('films');
const status = document.getElementById('status');
const search = document.getElementById('search');
let snapshot;
function add(parent, tag, text) {
  const el = document.createElement(tag);
  el.textContent = text;
  parent.append(el);
  return el;
}
function render() {
  films.replaceChildren();
  for (const movie of snapshot?.movies || []) {
    if (!movie.title.toLocaleLowerCase().includes(search.value.toLocaleLowerCase())) continue;
    const card = add(films, 'article', '');
    add(card, 'h2', movie.title);
    add(
      card,
      'p',
      [movie.year, movie.watchedAt ? 'Watched' : 'To Watch'].filter(Boolean).join(' · '),
    );
    if (!movie.releases.length) add(card, 'p', 'TBA');
    for (const release of movie.releases) {
      const date = new Date(`${release.date}T12:00:00Z`);
      add(
        card,
        'p',
        `${release.platform || release.kind} · ${Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'TBA'}${release.confidence === 'rumored' ? ' · Unconfirmed' : ''}`,
      );
    }
  }
  if (snapshot && !films.children.length)
    add(
      films,
      'p',
      search.value ? 'No saved films match that title.' : 'Your synced library is empty.',
    );
}
async function load() {
  films.replaceChildren();
  status.textContent = 'Opening the last synced library…';
  snapshot = await readOfflineLibrary().catch(() => null);
  const available = !!snapshot?.owner && Array.isArray(snapshot.movies);
  if (!available) snapshot = null;
  status.textContent = available
    ? `${snapshot.movies.length} saved films · Last synced ${new Date(snapshot.syncedAt).toLocaleString()}`
    : 'No offline library is stored on this device. Sign in while connected to sync your films.';
  document.getElementById('forget').hidden = !available;
  document.getElementById('search-label').hidden = !available;
  document.getElementById('notice').hidden = !available;
  render();
}
search.addEventListener('input', render);
document.getElementById('forget').addEventListener('click', async () => {
  await clearOfflineLibrary();
  await load();
});
window.addEventListener('storage', (event) => {
  if (event.key === 'alist-offline-cleared') void load();
});
navigator.serviceWorker?.addEventListener('message', (event) => {
  if (event.data?.type === 'offline-cleared') void load();
});
window.addEventListener('pageshow', () => {
  void load();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void load();
});
void load();

window.addEventListener('pagehide', () => {
  snapshot = null;
  films.replaceChildren();
  search.value = '';
});
