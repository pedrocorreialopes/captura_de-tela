/* ==========================================================================
   Print Fácil — utilitários compartilhados
   ========================================================================== */
(function (global) {
  'use strict';

  var PF = global.PF || (global.PF = {});

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
    'quinta-feira', 'sexta-feira', 'sábado'];

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function startOfDay(d) {
    var c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c;
  }

  /** Rótulo amigável de agrupamento: Hoje / Ontem / "12 de novembro de 2026" */
  function dayLabel(ts) {
    var d = new Date(ts);
    var today = startOfDay(new Date()).getTime();
    var day = startOfDay(d).getTime();
    var diff = Math.round((today - day) / 86400000);
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Ontem';
    if (diff > 1 && diff < 7) {
      return DIAS[d.getDay()].charAt(0).toUpperCase() + DIAS[d.getDay()].slice(1);
    }
    return d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear();
  }

  function time(ts) {
    var d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function dateTime(ts) {
    var d = new Date(ts);
    return d.getDate() + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() +
      ' às ' + time(ts);
  }

  function dayKey(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function fmtSize(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024) return bytes + ' B';
    var kb = bytes / 1024;
    if (kb < 1024) return (kb < 10 ? kb.toFixed(1) : Math.round(kb)) + ' KB';
    var mb = kb / 1024;
    return (mb < 10 ? mb.toFixed(1) : Math.round(mb)) + ' MB';
  }

  function stamp(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function extFor(type) { return /jpe?g/.test(type || '') ? 'jpg' : 'png'; }

  function fileNameFor(shot) {
    return 'printfacil-' + stamp(shot.createdAt) + '.' + extFor(shot.type);
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function downloadShot(shot) {
    downloadBlob(shot.blob, fileNameFor(shot));
  }

  function canShareFiles() {
    return !!(navigator.canShare && navigator.share && typeof File === 'function');
  }

  /** Compartilha nativamente; devolve 'shared' | 'cancelled' | 'unsupported' */
  async function shareShot(shot) {
    var file = new File([shot.blob], fileNameFor(shot), { type: shot.type || 'image/png' });
    if (canShareFiles() && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Captura — Print Fácil' });
        return 'shared';
      } catch (err) {
        if (err && err.name === 'AbortError') return 'cancelled';
        return 'unsupported';
      }
    }
    return 'unsupported';
  }

  /** Converte qualquer blob de imagem em PNG (para a área de transferência) */
  async function toPngBlob(blob) {
    if (/png/.test(blob.type || '')) return blob;
    var bitmap = await createImageBitmap(blob);
    var canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    bitmap.close && bitmap.close();
    return await new Promise(function (resolve) {
      canvas.toBlob(function (b) { resolve(b); }, 'image/png');
    });
  }

  async function copyShot(shot) {
    if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === 'undefined') {
      return false;
    }
    try {
      var png = await toPngBlob(shot.blob);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      return true;
    } catch (err) {
      return false;
    }
  }

  function vibrate(ms) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (err) { /* silencioso */ }
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function nextFrame() {
    return new Promise(function (r) {
      if (typeof requestAnimationFrame !== 'function') return setTimeout(r, 16);
      requestAnimationFrame(function () { requestAnimationFrame(r); });
    });
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  PF.util = {
    $: $, $$: $$, pad: pad,
    dayLabel: dayLabel, dayKey: dayKey, time: time, dateTime: dateTime,
    fmtSize: fmtSize, stamp: stamp, escapeHtml: escapeHtml, extFor: extFor,
    fileNameFor: fileNameFor, downloadBlob: downloadBlob, downloadShot: downloadShot,
    shareShot: shareShot, copyShot: copyShot, toPngBlob: toPngBlob,
    vibrate: vibrate, wait: wait, nextFrame: nextFrame, debounce: debounce,
    canShareFiles: canShareFiles
  };
})(window);
