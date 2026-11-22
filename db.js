// Plant Daddy — tiny IndexedDB wrapper.
// Everything is stored on the device in the browser: plants, care log entries, and photos (as image blobs).

const DB = (() => {
  const NAME = 'plant-daddy';
  const VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('plants')) db.createObjectStore('plants', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('logs')) {
          const s = db.createObjectStore('logs', { keyPath: 'id' });
          s.createIndex('plantId', 'plantId');
        }
        if (!db.objectStoreNames.contains('photos')) {
          const s = db.createObjectStore('photos', { keyPath: 'id' });
          s.createIndex('plantId', 'plantId');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function wrap(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function store(name, mode = 'readonly') {
    const db = await open();
    return db.transaction(name, mode).objectStore(name);
  }

  const api = {
    async all(name) { return wrap((await store(name)).getAll()); },
    async get(name, id) { return wrap((await store(name)).get(id)); },
    async put(name, value) { return wrap((await store(name, 'readwrite')).put(value)); },
    async del(name, id) { return wrap((await store(name, 'readwrite')).delete(id)); },
    async byPlant(name, plantId) {
      const s = await store(name);
      return wrap(s.index('plantId').getAll(plantId));
    },
    async clear(name) { return wrap((await store(name, 'readwrite')).clear()); },
    async deletePlant(plantId) {
      const logs = await api.byPlant('logs', plantId);
      const photos = await api.byPlant('photos', plantId);
      for (const l of logs) await api.del('logs', l.id);
      for (const p of photos) await api.del('photos', p.id);
      await api.del('plants', plantId);
    },
  };
  return api;
})();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
