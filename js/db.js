/* ==========================================================================
   Print Fácil — persistência local (IndexedDB)
   Cada captura guarda apenas o Blob da imagem + metadados. Nada sai do
   dispositivo: não há nenhuma chamada de rede neste módulo.
   ========================================================================== */
(function (global) {
  'use strict';

  var PF = global.PF || (global.PF = {});

  var DB_NAME = 'printfacil';
  var DB_VERSION = 1;
  var STORE = 'shots';

  /** Guarda os Object URLs das miniaturas para liberar memória depois. */
  var urlCache = new Map();

  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        reject(new Error('Este navegador não possui IndexedDB.'));
        return;
      }
      var req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = function (event) {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('createdAt', 'createdAt');
        }
        if (event.oldVersion < 1) { /* primeira criação */ }
      };

      req.onsuccess = function () {
        var db = req.result;
        db.onversionchange = function () { db.close(); dbPromise = null; };
        resolve(db);
      };

      req.onerror = function () { reject(req.error || new Error('Falha ao abrir o banco local.')); };
      req.onblocked = function () { reject(new Error('O banco local está bloqueado por outra aba.')); };
    });

    return dbPromise;
  }

  function tx(mode) {
    return open().then(function (db) {
      return db.transaction(STORE, mode).objectStore(STORE);
    });
  }

  function request(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  /** Persiste uma captura. Retorna o registro completo (com id). */
  async function add(record) {
    var store = await tx('readwrite');
    var item = {
      createdAt: record.createdAt || Date.now(),
      type: record.type || 'image/png',
      width: record.width || 0,
      height: record.height || 0,
      size: record.blob ? record.blob.size : (record.size || 0),
      source: record.source || 'screen',
      blob: record.blob
    };
    var id = await request(store.add(item));
    item.id = id;
    return item;
  }

  /** Todas as capturas, mais recentes primeiro. */
  async function all() {
    var store = await tx('readonly');
    var items = await request(store.getAll());
    return items.sort(function (a, b) { return b.createdAt - a.createdAt; });
  }

  async function get(id) {
    var store = await tx('readonly');
    return await request(store.get(Number(id)));
  }

  async function remove(id) {
    var store = await tx('readwrite');
    return await request(store.delete(Number(id)));
  }

  async function removeMany(ids) {
    var store = await tx('readwrite');
    await Promise.all(ids.map(function (id) { return request(store.delete(Number(id))); }));
    return ids.length;
  }

  async function clear() {
    var store = await tx('readwrite');
    return await request(store.clear());
  }

  async function stats() {
    var items = await all();
    var bytes = items.reduce(function sum(total, s) { return total + (s.size || 0); }, 0);
    return {
      count: items.length,
      bytes: bytes,
      last: items.length ? items[0].createdAt : null
    };
  }

  /** Object URL da miniatura, reaproveitado por blob. */
  function thumbUrl(id, blob) {
    var key = String(id);
    if (urlCache.has(key)) return urlCache.get(key);
    var url = URL.createObjectURL(blob);
    urlCache.set(key, url);
    return url;
  }

  function releaseUrl(id) {
    var key = String(id);
    if (urlCache.has(key)) {
      URL.revokeObjectURL(urlCache.get(key));
      urlCache.delete(key);
    }
  }

  function releaseAll() {
    urlCache.forEach(function (url) { URL.revokeObjectURL(url); });
    urlCache.clear();
  }

  PF.db = {
    add: add,
    all: all,
    get: get,
    remove: remove,
    removeMany: removeMany,
    clear: clear,
    stats: stats,
    thumbUrl: thumbUrl,
    releaseUrl: releaseUrl,
    releaseAll: releaseAll,
    DB_NAME: DB_NAME
  };
})(window);
