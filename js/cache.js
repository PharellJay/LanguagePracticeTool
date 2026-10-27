// Translation cache in IndexedDB, keyed by target language + English source text.
// Keying on the text (not the item id) means editing an item in items.json fetches a fresh translation.
// Falls back to an in-memory map when IndexedDB is unavailable.

const DB_NAME = "lpt-cache";
const STORE = "translations";

const memory = new Map();
let dbPromise = null;

function key(lang, text) {
  return `${lang}\u0000${text}`;
}

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === "undefined") return resolve(null);
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

// Returns a Map of text -> cached translation for the texts that are cached.
export async function getMany(lang, texts) {
  const found = new Map();
  const db = await openDb();
  if (!db) {
    for (const t of texts) if (memory.has(key(lang, t))) found.set(t, memory.get(key(lang, t)));
    return found;
  }
  return new Promise((resolve) => {
    try {
      const store = db.transaction(STORE, "readonly").objectStore(STORE);
      let pending = texts.length;
      if (pending === 0) return resolve(found);
      for (const t of texts) {
        const req = store.get(key(lang, t));
        req.onsuccess = () => {
          if (req.result !== undefined) found.set(t, req.result);
          if (--pending === 0) resolve(found);
        };
        req.onerror = () => {
          if (--pending === 0) resolve(found);
        };
      }
    } catch {
      resolve(found);
    }
  });
}

// Stores a Map of text -> translation.
export async function putMany(lang, translations) {
  for (const [t, v] of translations) memory.set(key(lang, t), v);
  const db = await openDb();
  if (!db) return;
  await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const [t, v] of translations) store.put(v, key(lang, t));
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}
