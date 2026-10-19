import { CONFIG } from './config.js';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(CONFIG.DB_STORE)) {
        req.result.createObjectStore(CONFIG.DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveHandleToIDB(handle) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONFIG.DB_STORE, 'readwrite');
    tx.objectStore(CONFIG.DB_STORE).put(handle, CONFIG.DB_HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadHandleFromIDB() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CONFIG.DB_STORE, 'readonly');
      const req = tx.objectStore(CONFIG.DB_STORE).get(CONFIG.DB_HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch { return null; }
}

export async function clearHandleFromIDB() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONFIG.DB_STORE, 'readwrite');
    tx.objectStore(CONFIG.DB_STORE).delete(CONFIG.DB_HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function readFileText(handle) {
  const file = await handle.getFile();
  return await file.text();
}

export async function writeFileText(handle, text) {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

export async function ensurePermission(handle, mode = 'readwrite') {
  const opts = { mode };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  try {
    return (await handle.requestPermission(opts)) === 'granted';
  } catch { return false; }
}
