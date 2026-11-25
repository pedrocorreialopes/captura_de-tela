/* ==========================================================================
   Print Fácil — orquestração da aplicação
   Rotas em hash, modais acessíveis, captura, toasts e ponte com a galeria.
   ========================================================================== */
(function (global) {
  'use strict';

  var PF = global.PF || (global.PF = {});
  var U = PF.util;

  var TOAST_MS = 3400;
  var captureInFlight = false;
  var chromeHidden = false;

  var ROUTES = ['home', 'gallery', 'settings'];
  var currentRoute = 'home';
  var lastFocused = null;

  /* -------------------------------- toasts -------------------------------- */

  function toast(message, kind) {
    var stack = U.$('#toast-stack');
    if (!stack || !message) return;
    var node = document.createElement('div');
    node.className = 'toast' + (kind ? ' toast--' + kind : '');
    node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    node.innerHTML = '<span class="toast__dot" aria-hidden="true"></span><span>' +
      U.escapeHtml(message) + '</span>';
    stack.appendChild(node);
    setTimeout(function () {
      node.classList.add('toast--out');
      setTimeout(function () { node.remove(); }, 260);
    }, TOAST_MS);
  }

  /* -------------------------------- modais -------------------------------- */

  var modalStack = [];

  function openModal(id) {
    var modal = document.getElementById(id);
    if (!modal || !modal.hidden) return;
    if (!modalStack.length) lastFocused = document.activeElement;
    modal.hidden = false;
    modalStack.push(id);
    document.body.style.overflow = 'hidden';
    var focusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable) setTimeout(function () { focusable.focus(); }, 60);
  }

  function closeModal(id) {
    var modal = document.getElementById(id);
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    modalStack = modalStack.filter(function (item) { return item !== id; });
    modal.dispatchEvent(new CustomEvent('pf:modal-closed'));
    if (!modalStack.length) {
      document.body.style.overflow = '';
      if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    }
  }

  function closeTopModal() {
    if (!modalStack.length) return false;
    closeModal(modalStack[modalStack.length - 1]);
    return true;
  }

  function bindModals() {
    U.$$('[data-close-modal]').forEach(function (node) {
      node.addEventListener('click', function () {
        var modal = node.closest('.modal');
        if (modal) closeModal(modal.id);
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (closeTopModal()) e.preventDefault();
      }
      // Trap de foco simples dentro do modal do topo
      if (e.key === 'Tab' && modalStack.length) {
        var modal = document.getElementById(modalStack[modalStack.length - 1]);
        var nodes = U.$$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', modal)
          .filter(function (n) { return !n.disabled && n.offsetParent !== null; });
        if (!nodes.length) return;
        var first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* -------------------------------- rotas -------------------------------- */

  function parseRoute() {
    var hash = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return ROUTES.indexOf(hash) >= 0 ? hash : 'home';
  }

  function setRoute(route, opts) {
    var target = ROUTES.indexOf(route) >= 0 ? route : 'home';
    currentRoute = target;

    ROUTES.forEach(function (name) {
      var view = document.getElementById('view-' + name);
      if (view) view.classList.toggle('hidden', name !== target);
    });

    U.$$('[data-route]').forEach(function (btn) {
      if (btn.tagName === 'A') return;
      btn.classList.toggle('is-active', btn.dataset.route === target);
    });

    if (!opts || opts.hash !== false) {
      var nextHash = '#/' + target;
      if (location.hash !== nextHash) {
        try { history.replaceState(null, '', nextHash); }
        catch (err) { location.hash = nextHash; }
      }
    }

    if (target === 'gallery') {
      PF.gallery.refresh();
    }
    if (target === 'settings') {
      syncSettingsForm();
      refreshStats(PF.gallery.snapshot());
    }

    if (!opts || opts.scroll !== false) global.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function bindRoutes() {
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('[data-route]');
      if (!trigger || trigger.tagName === 'A') return;
      if (trigger.dataset.route === 'home' && currentRoute === 'home') {
        global.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      setRoute(trigger.dataset.route);
    });

    global.addEventListener('hashchange', function () {
      var route = parseRoute();
      if (route !== currentRoute) setRoute(route, { hash: false });
    });
  }

  /* ---------------------------- status/estatísticas ---------------------------- */

  function updateCaptureStatus() {
    var info = PF.capture.availability();
    var chip = U.$('#capture-status');
    var text = U.$('#capture-status-text');
    var btn = U.$('#btn-capture');
    if (chip) chip.dataset.state = info.state;
    if (text) text.textContent = info.text;
    if (btn) {
      btn.disabled = !info.supported;
      btn.title = info.supported ? 'Iniciar captura' : info.text;
    }
  }

  function refreshStats(list) {
    var shots = list || PF.gallery.snapshot();
    var bytes = shots.reduce(function (sum, s) { return sum + (s.size || 0); }, 0);

    var total = U.$('#stat-total');
    if (total) total.textContent = String(shots.length);
    var size = U.$('#stat-size');
    if (size) size.textContent = U.fmtSize(bytes);
    var last = U.$('#stat-last');
    if (last) {
      last.textContent = shots.length ? U.dayLabel(shots[0].createdAt) + ' ' + U.time(shots[0].createdAt) : '—';
    }

    var navCount = U.$('#nav-count');
    if (navCount) {
      navCount.hidden = shots.length === 0;
      navCount.textContent = shots.length > 99 ? '99+' : String(shots.length);
    }
    var dataCount = U.$('#data-count');
    if (dataCount) dataCount.textContent = String(shots.length);
    var dataSize = U.$('#data-size');
    if (dataSize) dataSize.textContent = U.fmtSize(bytes);

    PF.fab.setBadge(shots.length);
  }

  /* -------------------------------- captura -------------------------------- */

  function showOverlay(message) {
    var overlay = U.$('#capture-overlay');
    var text = U.$('#capture-overlay-text');
    if (text && message) text.textContent = message;
    if (overlay) overlay.hidden = false;
  }

  function hideOverlay() {
    var overlay = U.$('#capture-overlay');
    if (overlay) overlay.hidden = true;
  }

  function hideChrome() {
    // Esconde o que não pode aparecer na imagem: o overlay de progresso sempre
    // sai; o botão flutuante só sai se o usuário pediu.
    hideOverlay();
    if (!PF.settings.get('hideFab')) return;
    chromeHidden = true;
    var fab = U.$('#fab');
    if (fab) fab.style.visibility = 'hidden';
  }

  function restoreChrome() {
    if (!chromeHidden) return;
    chromeHidden = false;
    var fab = U.$('#fab');
    if (fab) fab.style.visibility = '';
  }

  async function startCapture(source) {
    if (captureInFlight) return;
    var info = PF.capture.availability();
    if (!info.supported) {
      toast(info.text, 'warn');
      return;
    }

    captureInFlight = true;
    var settings = PF.settings.get();
    showOverlay('Aguardando autorização do navegador…');
    PF.fab.setBusy(true);
    PF.fab.hide();

    try {
      var shot = await PF.capture.capture({
        onStage: function (msg) { showOverlay(msg); },
        hideChrome: hideChrome,
        restoreChrome: restoreChrome
      });

      hideOverlay();
      restoreChrome();

      if (!shot || shot.cancelled) {
        if (shot && shot.reason === 'denied' && shot.error) {
          toast(shot.error.title + ' — ' + shot.error.detail, 'warn');
        } else if (shot && shot.reason === 'busy') {
          toast('Já existe uma captura em andamento.', 'warn');
        }
        return;
      }

      var record = {
        blob: shot.blob,
        type: shot.type,
        width: shot.width,
        height: shot.height,
        createdAt: Date.now(),
        source: 'screen'
      };

      if (settings.autosave) {
        var saved = await PF.gallery.addAndRefresh(record);
        if (settings.vibrate) U.vibrate([12, 40, 12]);
        toast('Captura salva na galeria.', 'ok');
        openPreview(saved, { savedAlready: true });
      } else {
        openPreview(record, { savedAlready: false });
      }
    } catch (err) {
      hideOverlay();
      restoreChrome();
      var friendly = err && err.friendly ? err.friendly : PF.capture.friendlyError(err);
      toast(friendly.title + ' — ' + friendly.detail, 'error');
    } finally {
      captureInFlight = false;
      PF.fab.setBusy(false);
      PF.fab.show();
      PF.fab.applyAppearance();
    }
  }

  /* ------------------------------- prévia ------------------------------- */

  var previewState = { record: null, objectUrl: null, saved: false };

  function openPreview(record, opts) {
    previewState.record = record;
    previewState.saved = !!(opts && opts.savedAlready);

    var img = U.$('#preview-img');
    if (previewState.objectUrl) URL.revokeObjectURL(previewState.objectUrl);
    previewState.objectUrl = URL.createObjectURL(record.blob);
    img.src = previewState.objectUrl;

    var meta = U.$('#preview-meta');
    if (meta) {
      meta.textContent = (U.extFor(record.type) === 'jpg' ? 'JPG' : 'PNG') + ' · ' +
        (record.width || '?') + '×' + (record.height || '?') + ' · ' +
        U.fmtSize(record.size || record.blob.size) + ' · ' + U.time(record.createdAt || Date.now());
    }
    var title = U.$('#preview-title');
    if (title) title.textContent = previewState.saved ? 'Captura salva' : 'Captura pronta';

    var saveBtn = U.$('#btn-preview-save');
    if (saveBtn) {
      saveBtn.disabled = previewState.saved;
      saveBtn.textContent = previewState.saved ? 'Já salva' : 'Salvar';
    }
    var delBtn = U.$('#btn-preview-delete');
    if (delBtn) delBtn.textContent = previewState.saved ? 'Excluir' : 'Descartar';

    openModal('modal-preview');
  }

  function bindPreview() {
    var saveBtn = U.$('#btn-preview-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        if (!previewState.record || previewState.saved) return;
        try {
          var saved = await PF.gallery.addAndRefresh(previewState.record);
          previewState.saved = true;
          saveBtn.disabled = true;
          saveBtn.textContent = 'Já salva';
          var delBtn = U.$('#btn-preview-delete');
          if (delBtn) delBtn.textContent = 'Excluir';
          toast('Captura salva na galeria.', 'ok');
          previewState.record = saved;
        } catch (err) {
          toast('Erro ao salvar: ' + err.message, 'error');
        }
      });
    }

    var dlBtn = U.$('#btn-preview-download');
    if (dlBtn) {
      dlBtn.addEventListener('click', function () {
        var rec = previewState.record;
        if (!rec) return;
        U.downloadShot({ blob: rec.blob, type: rec.type, createdAt: rec.createdAt || Date.now() });
        toast('Download iniciado.', 'ok');
      });
    }

    var shareBtn = U.$('#btn-preview-share');
    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        var rec = previewState.record;
        if (!rec) return;
        PF.gallery.shareOne({
          blob: rec.blob, type: rec.type,
          createdAt: rec.createdAt || Date.now(), Id: rec.id, id: rec.id
        });
      });
    }

    var delBtn = U.$('#btn-preview-delete');
    if (delBtn) {
      delBtn.addEventListener('click', async function () {
        var rec = previewState.record;
        if (!rec) return;
        if (previewState.saved && rec.id) {
          PF.modal.close('modal-preview');
          var ok = await PF.gallery.confirmAction({
            title: 'Excluir captura',
            text: 'Esta captura salva será removida permanentemente.',
            okLabel: 'Excluir'
          });
          if (ok) {
            await PF.db.remove(rec.id);
            PF.db.releaseUrl(rec.id);
            await PF.gallery.refresh();
            toast('Captura excluída.', 'ok');
          }
          return;
        }
        closeModal('modal-preview');
        toast('Captura descartada.', 'warn');
      });
    }

    var previewModal = U.$('#modal-preview');
    if (previewModal) {
      previewModal.addEventListener('pf:modal-closed', function () {
        if (previewState.objectUrl) {
          URL.revokeObjectURL(previewState.objectUrl);
          previewState.objectUrl = null;
        }
        previewState.record = null;
      });
    }
  }

  /* ------------------------------ ajustes/UI ------------------------------ */

  function syncSettingsForm() {
    var s = PF.settings.get();

    var fabEnabled = U.$('#set-fab-enabled');
    if (fabEnabled) fabEnabled.checked = !!s.fabEnabled;
    var fabSize = U.$('#set-fab-size');
    if (fabSize) fabSize.value = s.fabSize;
    var fabSizeVal = U.$('#fab-size-val');
    if (fabSizeVal) fabSizeVal.textContent = String(s.fabSize);
    var fabOpacity = U.$('#set-fab-opacity');
    if (fabOpacity) fabOpacity.value = Math.round(s.fabOpacity * 100);
    var fabOpVal = U.$('#fab-opacity-val');
    if (fabOpVal) fabOpVal.textContent = String(Math.round(s.fabOpacity * 100));
    var fabPos = U.$('#set-fab-position');
    if (fabPos) fabPos.value = s.fabHome;
    var quality = U.$('#set-quality');
    if (quality) quality.value = s.quality;
    var qualityVal = U.$('#quality-val');
    if (qualityVal) qualityVal.textContent = String(s.quality);
    var hideFab = U.$('#set-hide-fab');
    if (hideFab) hideFab.checked = !!s.hideFab;
    var autosave = U.$('#set-autosave');
    if (autosave) autosave.checked = !!s.autosave;
    var vibrate = U.$('#set-vibrate');
    if (vibrate) vibrate.checked = !!s.vibrate;

    var formatInput = U.$('input[name="format"][value="' + s.format + '"]');
    if (formatInput) formatInput.checked = true;
    var themeInput = U.$('input[name="theme"][value="' + s.theme + '"]');
    if (themeInput) themeInput.checked = true;

    var qualityRow = quality ? quality.closest('.row') : null;
    if (qualityRow) qualityRow.style.opacity = s.format === 'jpg' ? '1' : '.55';
  }

  function bindSettings() {
    var fabEnabled = U.$('#set-fab-enabled');
    if (fabEnabled) {
      fabEnabled.addEventListener('change', function () {
        PF.settings.update({ fabEnabled: fabEnabled.checked });
        toast(fabEnabled.checked ? 'Botão flutuante ativado.' : 'Botão flutuante desativado.', 'ok');
      });
    }

    var fabSize = U.$('#set-fab-size');
    if (fabSize) {
      fabSize.addEventListener('input', function () {
        var value = Number(fabSize.value);
        var label = U.$('#fab-size-val');
        if (label) label.textContent = String(value);
        PF.settings.update({ fabSize: value }, { notify: true });
      });
      fabSize.addEventListener('change', function () { PF.settings.update({ fabSize: Number(fabSize.value) }); });
    }

    var fabOpacity = U.$('#set-fab-opacity');
    if (fabOpacity) {
      fabOpacity.addEventListener('input', function () {
        var value = Number(fabOpacity.value);
        var label = U.$('#fab-opacity-val');
        if (label) label.textContent = String(value);
        PF.settings.update({ fabOpacity: value / 100 });
      });
    }

    var fabPos = U.$('#set-fab-position');
    if (fabPos) {
      fabPos.addEventListener('change', function () {
        PF.settings.update({ fabHome: fabPos.value, fabX: null, fabY: null });
        PF.fab.resetToHome();
        toast('Posição inicial atualizada.', 'ok');
      });
    }

    var resetFab = U.$('#btn-reset-fab');
    if (resetFab) {
      resetFab.addEventListener('click', function () {
        PF.fab.resetToHome();
        toast('Botão reposicionado.', 'ok');
      });
    }

    U.$$('input[name="format"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        if (!radio.checked) return;
        PF.settings.update({ format: radio.value });
        syncSettingsForm();
      });
    });

    var quality = U.$('#set-quality');
    if (quality) {
      quality.addEventListener('input', function () {
        var label = U.$('#quality-val');
        if (label) label.textContent = quality.value;
        PF.settings.update({ quality: Number(quality.value) });
      });
    }

    var hideFab = U.$('#set-hide-fab');
    if (hideFab) hideFab.addEventListener('change', function () {
      PF.settings.update({ hideFab: hideFab.checked });
    });

    var autosave = U.$('#set-autosave');
    if (autosave) autosave.addEventListener('change', function () {
      PF.settings.update({ autosave: autosave.checked });
    });

    var vibrate = U.$('#set-vibrate');
    if (vibrate) {
      vibrate.addEventListener('change', function () {
        PF.settings.update({ vibrate: vibrate.checked });
        if (vibrate.checked) {
          if (navigator.vibrate) { U.vibrate(20); toast('Vibração ativada.', 'ok'); }
          else toast('Este dispositivo não oferece vibração.', 'warn');
        }
      });
    }

    U.$$('input[name="theme"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        if (!radio.checked) return;
        PF.settings.update({ theme: radio.value });
      });
    });

    var themeToggle = U.$('#theme-toggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', function () {
        var next = PF.settings.effectiveTheme() === 'dark' ? 'light' : 'dark';
        PF.settings.update({ theme: next });
        syncSettingsForm();
        toast(next === 'light' ? 'Tema claro ativado.' : 'Tema escuro ativado.', 'ok');
      });
    }

    var resetSettings = U.$('#btn-reset-settings');
    if (resetSettings) {
      resetSettings.addEventListener('click', async function () {
        var ok = await PF.gallery.confirmAction({
          title: 'Restaurar padrões',
          text: 'As preferências voltam ao padrão. Suas capturas não são afetadas.',
          okLabel: 'Restaurar',
          danger: false
        });
        if (!ok) return;
        PF.settings.reset();
        syncSettingsForm();
        PF.fab.resetToHome();
        PF.fab.applyAppearance();
        toast('Configurações restauradas.', 'ok');
      });
    }
  }

  /* ------------------------------- PWA ------------------------------- */

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' &&
        location.hostname !== '127.0.0.1') return;
    navigator.serviceWorker.register('sw.js').catch(function () { /* opcional */ });
  }

  /* -------------------------------- init -------------------------------- */

  function bindHeader() {
    var quick = U.$('#quick-capture');
    if (quick) quick.addEventListener('click', function () { startCapture('header'); });
    var c1 = U.$('#btn-capture');
    if (c1) c1.addEventListener('click', function () { startCapture('hero'); });
    var c2 = U.$('#btn-capture-2');
    if (c2) c2.addEventListener('click', function () { startCapture('gallery'); });

    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('[data-capture]');
      if (trigger) startCapture('empty');
    });
  }

  async function init() {
    PF.settings.init();
    PF.modal = { open: openModal, close: closeModal, closeTop: closeTopModal };

    bindModals();
    bindRoutes();
    bindHeader();
    bindSettings();
    bindPreview();

    PF.fab.init({ onTap: function () { startCapture('fab'); } });

    PF.gallery.bind();
    await PF.gallery.refresh();

    syncSettingsForm();
    updateCaptureStatus();
    setRoute(parseRoute(), { scroll: false });

    // Revalida o status ao voltar para a aba (permissões podem ter mudado)
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        updateCaptureStatus();
        PF.fab.applyAppearance();
      }
    });

    registerServiceWorker();

    PF.app.toast = toast;
    PF.app.refreshStats = refreshStats;
    PF.app.startCapture = startCapture;
  }

  PF.app = {
    init: init,
    toast: toast,
    refreshStats: refreshStats,
    startCapture: startCapture,
    setRoute: setRoute
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
