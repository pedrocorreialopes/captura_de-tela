/* ==========================================================================
   Print Fácil — configurações persistentes (localStorage)
   Chave versionada; leitura sempre mesclada com os padrões para nunca
   perder preferências ao adicionar novas opções.
   ========================================================================== */
(function (global) {
  'use strict';

  var PF = global.PF || (global.PF = {});
  var STORAGE_KEY = 'printfacil.settings.v1';

  var DEFAULTS = {
    fabEnabled: true,
    fabSize: 64,
    fabOpacity: 0.96,
    fabHome: 'br',            // posição inicial: br | bl | tr | tl | mr
    fabX: null,               // posição arrastada (px, relativa à viewport)
    fabY: null,
    format: 'png',            // png | jpg
    quality: 92,              // 40–100 (só JPG)
    hideFab: true,            // esconde o botão/UI antes de fotografar
    autosave: true,           // salva direto, sem confirmar
    vibrate: true,
    theme: 'dark'             // dark | light | system
  };

  var state = Object.assign({}, DEFAULTS);
  var listeners = [];

  var media = global.matchMedia ? global.matchMedia('(prefers-color-scheme: light)') : null;

  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

  function read() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (err) { raw = null; }
    if (!raw) return Object.assign({}, DEFAULTS);
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return Object.assign({}, DEFAULTS);
      var merged = Object.assign({}, DEFAULTS);
      Object.keys(DEFAULTS).forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(parsed, key) && parsed[key] !== undefined) {
          merged[key] = parsed[key];
        }
      });
      return merged;
    } catch (err) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (err) { /* modo privado / cota cheia: mantém em memória */ }
  }

  function emit(keys) {
    listeners.forEach(function (fn) { fn(get(), keys || []); });
  }

  function get(key) {
    if (key) return state[key];
    return Object.assign({}, state);
  }

  function normalize(patch) {
    var out = {};
    Object.keys(patch).forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) return;
      var value = patch[key];
      switch (key) {
        case 'fabSize': value = clamp(Math.round(Number(value) || DEFAULTS.fabSize), 44, 96); break;
        case 'fabOpacity': value = clamp(Number(value) || DEFAULTS.fabOpacity, 0.35, 1); break;
        case 'quality': value = clamp(Math.round(Number(value) || DEFAULTS.quality), 40, 100); break;
        case 'format': value = /jpe?g/i.test(String(value)) ? 'jpg' : 'png'; break;
        case 'theme': value = ['dark', 'light', 'system'].indexOf(value) >= 0 ? value : DEFAULTS.theme; break;
        case 'fabHome': value = ['br', 'bl', 'tr', 'tl', 'mr'].indexOf(value) >= 0 ? value : DEFAULTS.fabHome; break;
        case 'fabX': case 'fabY': value = (value === null || isNaN(Number(value))) ? null : Number(value); break;
        default: value = !!value;
      }
      out[key] = value;
    });
    return out;
  }

  function update(patch, opts) {
    var normalized = normalize(patch);
    Object.keys(normalized).forEach(function (key) { state[key] = normalized[key]; });
    persist();
    applyTheme();
    if (!opts || opts.notify !== false) emit(Object.keys(normalized));
    return get();
  }

  function reset() {
    state = Object.assign({}, DEFAULTS);
    persist();
    applyTheme();
    emit(Object.keys(DEFAULTS));
    return get();
  }

  /** Tema efetivo considerado (resolve "system") */
  function effectiveTheme() {
    if (state.theme === 'system') {
      return (media && media.matches) ? 'light' : 'dark';
    }
    return state.theme === 'light' ? 'light' : 'dark';
  }

  function applyTheme() {
    var theme = effectiveTheme();
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f5f7fc' : '#0a0c12');
    return theme;
  }

  function onChange(fn) {
    listeners.push(fn);
    return function unsubscribe() {
      listeners = listeners.filter(function (item) { return item !== fn; });
    };
  }

  function init() {
    state = read();
    applyTheme();
    if (media) {
      var handler = function () { if (state.theme === 'system') { applyTheme(); emit(['theme']); } };
      if (media.addEventListener) media.addEventListener('change', handler);
      else if (media.addListener) media.addListener(handler);
    }
    return state;
  }

  PF.settings = {
    DEFAULTS: DEFAULTS,
    STORAGE_KEY: STORAGE_KEY,
    init: init,
    get: get,
    update: update,
    reset: reset,
    applyTheme: applyTheme,
    effectiveTheme: effectiveTheme,
    onChange: onChange
  };
})(window);
