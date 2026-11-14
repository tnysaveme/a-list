// Shared by the app, worker and offline reader. One atomic owner/epoch record.
const database = 'alist-offline-v1';
function openStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Offline storage is blocked'));
  });
}
async function transaction(update) {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', update ? 'readwrite' : 'readonly');
    const store = tx.objectStore('snapshots');
    const request = store.get('library');
    let result;
    request.onsuccess = () => {
      result = update ? update(request.result) : request.result;
      if (update) store.put(result, 'library');
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error('Offline storage unavailable'));
    };
  });
}
export function readOfflineLibrary() {
  return transaction();
}
export async function beginOfflineSession(owner) {
  let changed = false;
  const record = await transaction((current) => {
    if (current?.owner === owner) return current;
    changed = !!current?.owner;
    return { owner, epoch: crypto.randomUUID() };
  });
  if (changed && typeof window !== 'undefined') {
    try {
      localStorage.setItem('alist-offline-cleared', crypto.randomUUID());
    } catch {
      /* Storage is optional. */
    }
  }
  return record.epoch;
}
export function saveOfflineLibrary(snapshot, epoch) {
  return transaction((current) =>
    current?.owner === snapshot.owner && current.epoch === epoch ? { ...snapshot, epoch } : current,
  );
}
export async function clearOfflineLibrary() {
  await transaction(() => ({ owner: null, epoch: crypto.randomUUID() }));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('alist-offline-cleared'));
    try {
      localStorage.setItem('alist-offline-cleared', crypto.randomUUID());
    } catch {
      /* Optional cross-tab notification. */
    }
  }
}
