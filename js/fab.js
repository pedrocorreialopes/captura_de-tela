/* ==========================================================================
   Print Fácil — botão flutuante (FAB)
   - Arrastável com mouse, toque e teclado
   - Distingue toque de arrasto (para não capturar sem querer)
   - Mantém-se dentro da viewport e lembra a posição escolhida
   ========================================================================== */
(function (global) {
  'use strict';

  var PF = global.PF || (global.PF = {});
  var U = PF.util;

  var DRAG_THRESHOLD = 7; // px antes de considerar arrasto

  var el = null;
  var handlers = { onTap: null };
  var dragging = false;
  var pressed = false;
  var pointerId = null;
  var startPoint = null;
  var startRect = null;
  var moved = false;
  var suppressClickUntil = 0;

  function clampToViewport(x, y, size) {
    var margin = 6;
    var maxX = Math.max(margin, global.innerWidth - size - margin);
    var maxY = Math.max(margin, global.innerHeight - size - margin);
    return {
      x: Math.min(maxX, Math.max(margin, x)),
      y: Math.min(maxY, Math.max(margin, y))
    };
  }

  /** Posição derivada da preferência de canto, em px. */
  function homePosition(size) {
    var settings = PF.settings.get();
    var margin = global.innerWidth < 700 ? 18 : 26;
    var bottomOffset = global.innerWidth < 901 ? 88 : 30;
    var map = {
      br: { x: global.innerWidth - size - margin, y: global.innerHeight - size - bottomOffset },
      bl: { x: margin, y: global.innerHeight - size - bottomOffset },
      tr: { x: global.innerWidth - size - margin, y: margin + 78 },
      tl: { x: margin, y: margin + 78 },
      mr: { x: global.innerWidth - size - margin, y: (global.innerHeight - size) / 2 }
    };
    return clampToViewport((map[settings.fabHome] || map.br).x, (map[settings.fabHome] || map.br).y, size);
  }

  function applyPosition(x, y, opts) {
    var size = el.offsetWidth || 64;
    var pos = clampToViewport(x, y, size);
    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    if (opts && opts.save) {
      PF.settings.update({ fabX: Math.round(pos.x), fabY: Math.round(pos.y) }, { notify: false });
    }
    return pos;
  }

  function restorePosition() {
    var settings = PF.settings.get();
    var size = el.offsetWidth || settings.fabSize;
    if (typeof settings.fabX === 'number' && typeof settings.fabY === 'number') {
      // Recalcula se a viewport mudou muito (ex.: rotação do dispositivo).
      var scale = Math.min(
        global.innerWidth / (global.__pfPrevW || global.innerWidth),
        global.innerHeight / (global.__pfPrevH || global.innerHeight)
      );
      var x = scale < 1 ? settings.fabX * scale : settings.fabX;
      var y = scale < 1 ? settings.fabY * scale : settings.fabY;
      applyPosition(x, y, { save: false });
    } else {
      var home = homePosition(size);
      applyPosition(home.x, home.y, { save: false });
    }
    global.__pfPrevW = global.innerWidth;
    global.__pfPrevH = global.innerHeight;
  }

  function resetToHome() {
    var settings = PF.settings.get();
    PF.settings.update({ fabX: null, fabY: null }, { notify: false });
    var home = homePosition(settings.fabSize);
    applyPosition(home.x, home.y, { save: false });
  }

  function applyAppearance() {
    var settings = PF.settings.get();
    el.style.setProperty('--fab-size', settings.fabSize + 'px');
    el.style.setProperty('--fab-opacity', settings.fabOpacity);
    el.hidden = !settings.fabEnabled;
    el.setAttribute('aria-hidden', settings.fabEnabled ? 'false' : 'true');
    el.tabIndex = settings.fabEnabled ? 0 : -1;
  }

  function setBadge(count) {
    var badge = U.$('#fab-badge');
    if (!badge) return;
    if (count > 0) {
      badge.hidden = false;
      badge.textContent = count > 99 ? '99+' : String(count);
    } else {
      badge.hidden = true;
    }
  }

  function setBusy(isBusy) {
    el.classList.toggle('is-busy', !!isBusy);
    el.setAttribute('aria-busy', isBusy ? 'true' : 'false');
  }

  function flashPress() {
    el.classList.add('is-pressed');
    setTimeout(function () { el.classList.remove('is-pressed'); }, 560);
  }

  /* ------------------------------- arrasto ------------------------------- */
  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0 && event.pointerType === 'mouse') return;
    if (PF.capture.isBusy()) return;

    pointerId = event.pointerId;
    pressed = true;
    dragging = false;
    moved = false;
    startPoint = { x: event.clientX, y: event.clientY };
    var rect = el.getBoundingClientRect();
    startRect = { x: rect.left, y: rect.top };
    el.classList.add('is-pressed');
    try { el.setPointerCapture(event.pointerId); } catch (err) { /* ignora */ }
  }

  function onPointerMove(event) {
    if (!pressed || event.pointerId !== pointerId) return;
    var dx = event.clientX - startPoint.x;
    var dy = event.clientY - startPoint.y;

    if (!dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      dragging = true;
      moved = true;
      el.classList.add('is-dragging');
      el.classList.remove('is-pressed');
    }
    if (!dragging) return;

    event.preventDefault();
    applyPosition(startRect.x + dx, startRect.y + dy, { save: false });
  }

  function onPointerUp(event) {
    if (!pressed || (event.pointerId !== undefined && event.pointerId !== pointerId)) return;
    pressed = false;
    pointerId = null;

    var wasDragging = dragging;
    dragging = false;
    el.classList.remove('is-dragging');
    el.classList.remove('is-pressed');
    try { el.releasePointerCapture(event.pointerId); } catch (err) { /* ignora */ }

    if (wasDragging) {
      var rect = el.getBoundingClientRect();
      applyPosition(rect.left, rect.top, { save: true });
      suppressClickUntil = Date.now() + 350;
      flashPress();
      if (PF.settings.get('vibrate')) U.vibrate(8);
      return;
    }

    // Toque simples → captura (com animação de pressão).
    suppressClickUntil = Date.now() + 350;
    flashPress();
    trigger();
  }

  function trigger() {
    if (PF.capture.isBusy()) return;
    if (PF.settings.get('vibrate')) U.vibrate(14);
    if (typeof handlers.onTap === 'function') handlers.onTap('fab');
  }

  function onClick(event) {
    // Evita captura duplicada quando o pointerup já tratou o toque.
    if (Date.now() < suppressClickUntil) { event.preventDefault(); return; }
    trigger();
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      flashPress();
      trigger();
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown' ||
        event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      var step = event.shiftKey ? 24 : 8;
      var rect = el.getBoundingClientRect();
      var dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      var dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      applyPosition(rect.left + dx, rect.top + dy, { save: true });
    }
  }

  function onResize() {
    var rect = el.getBoundingClientRect();
    applyPosition(rect.left, rect.top, { save: false });
    global.__pfPrevW = global.innerWidth;
    global.__pfPrevH = global.innerHeight;
  }

  function init(options) {
    el = U.$('#fab');
    if (!el) return null;
    handlers.onTap = options && options.onTap;

    applyAppearance();
    requestAnimationFrame(restorePosition);

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('contextmenu', function (e) { if (dragging) e.preventDefault(); });

    global.addEventListener('resize', U.debounce(onResize, 160));
    global.addEventListener('orientationchange', function () { setTimeout(onResize, 240); });

    PF.settings.onChange(function (state, keys) {
      if (!keys.length || keys.indexOf('fabSize') >= 0 || keys.indexOf('fabOpacity') >= 0 ||
          keys.indexOf('fabEnabled') >= 0 || keys.indexOf('fabHome') >= 0) {
        applyAppearance();
        if (keys.indexOf('fabSize') >= 0 || keys.indexOf('fabHome') >= 0) {
          requestAnimationFrame(function () {
            var rect = el.getBoundingClientRect();
            applyPosition(rect.left, rect.top, { save: false });
          });
        }
      }
    });

    return el;
  }

  PF.fab = {
    init: init,
    setBadge: setBadge,
    setBusy: setBusy,
    applyAppearance: applyAppearance,
    resetToHome: resetToHome,
    hide: function () { if (el) el.classList.add('is-hidden'); },
    show: function () { if (el) el.classList.remove('is-hidden'); },
    element: function () { return el; }
  };
})(window);
