/* ==========================================================================
   Print Fácil — galeria de capturas
   Miniaturas agrupadas por data, seleção múltipla, visualizador, download,
   compartilhamento e exclusão. Tudo renderizado a partir do IndexedDB local.
   ========================================================================== */
(function (global) {
  'use strict';

  var PF = global.PF || (global.PF = {});
  var U = PF.util;

  var items = [];             // capturas em memória (mais recentes primeiro)
  var selecting = false;
  var selected = new Set();
  var viewerIndex = 0;
  var confirmResolver = null;

  var CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 13 4.5 4.5L19 7"/></svg>';

  function groupsFrom(list) {
    var map = new Map();
    list.forEach(function (shot) {
      var key = U.dayKey(shot.createdAt);
      if (!map.has(key)) map.set(key, { key: key, ts: shot.createdAt, items: [] });
      map.get(key).items.push(shot);
    });
    return Array.from(map.values());
  }

  function cardHtml(shot, opts) {
    var url = PF.db.thumbUrl(shot.id, shot.blob);
    var isSel = selected.has(shot.id);
    var showCheck = opts && opts.selectable;
    return '' +
      '<article class="shot-card' + (isSel ? ' is-selected' : '') + '" ' +
        'data-id="' + shot.id + '" tabindex="0" role="button" ' +
        'aria-label="Captura de ' + U.escapeHtml(U.dateTime(shot.createdAt)) + '">' +
        (showCheck ? '<span class="shot-card__check" aria-hidden="true">' + CHECK_SVG + '</span>' : '') +
        '<div class="shot-card__thumb">' +
          '<img src="' + url + '" alt="Captura de tela de ' + U.escapeHtml(U.dateTime(shot.createdAt)) + '" ' +
            'loading="lazy" decoding="async" width="' + (shot.width || 320) + '" height="' + (shot.height || 240) + '">' +
        '</div>' +
        '<div class="shot-card__meta">' +
          '<strong>' + U.time(shot.createdAt) + ' · ' + (U.extFor(shot.type) === 'jpg' ? 'JPG' : 'PNG') + '</strong>' +
          '<small>' + U.fmtSize(shot.size) + ' · ' + (shot.width || '?') + '×' + (shot.height || '?') + '</small>' +
        '</div>' +
      '</article>';
  }

  /* --------------------------- renderização --------------------------- */

  function renderLatest() {
    var grid = U.$('#latest-grid');
    var empty = U.$('#latest-empty');
    if (!grid) return;

    var latest = items.slice(0, 6);
    grid.innerHTML = latest.map(function (shot) { return cardHtml(shot, { selectable: false }); }).join('');
    if (empty) empty.hidden = latest.length > 0;
    grid.hidden = latest.length === 0;

    U.$$('.shot-card', grid).forEach(function (card) {
      var id = Number(card.dataset.id);
      card.addEventListener('click', function () { openViewer(id); });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openViewer(id); }
      });
    });
  }

  function renderGallery() {
    var host = U.$('#gallery-groups');
    var empty = U.$('#gallery-empty');
    var summary = U.$('#gallery-summary');
    if (!host) return;

    if (summary) {
      summary.textContent = items.length === 1 ? '1 imagem' : items.length + ' imagens';
    }

    if (!items.length) {
      host.innerHTML = '';
      if (empty) empty.hidden = false;
      if (selecting) setSelecting(false);
      return;
    }
    if (empty) empty.hidden = true;

    var groups = groupsFrom(items);
    host.innerHTML = groups.map(function (group) {
      return '' +
        '<section class="gallery__day" aria-label="' + U.escapeHtml(U.dayLabel(group.ts)) + '">' +
          '<div class="gallery__group-head">' +
            '<h2>' + U.escapeHtml(U.dayLabel(group.ts)) + '</h2>' +
            '<span class="gallery__group-count">' + group.items.length +
              (group.items.length === 1 ? ' captura' : ' capturas') + '</span>' +
          '</div>' +
          '<div class="gallery__grid">' +
            group.items.map(function (shot) { return cardHtml(shot, { selectable: true }); }).join('') +
          '</div>' +
        '</section>';
    }).join('');

    host.classList.toggle('is-selecting', selecting);

    U.$$('.shot-card', host).forEach(function (card) {
      var id = Number(card.dataset.id);
      card.addEventListener('click', function (e) { handleCardClick(id, e); });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (selecting || e.ctrlKey || e.metaKey) toggleSelect(id);
          else openViewer(id);
        }
      });
    });

    syncSelectionUI();
  }

  function handleCardClick(id, event) {
    if (selecting || event.ctrlKey || event.metaKey || event.shiftKey) {
      toggleSelect(id);
      return;
    }
    openViewer(id);
  }

  /* ---------------------------- seleção ---------------------------- */

  function setSelecting(on) {
    selecting = !!on;
    var btn = U.$('#btn-select-mode');
    var bar = U.$('#selection-bar');
    var gallery = U.$('#gallery-groups');
    if (btn) btn.textContent = selecting ? 'Cancelar' : 'Selecionar';
    if (bar) bar.classList.toggle('hidden', !selecting);
    if (gallery) gallery.classList.toggle('is-selecting', selecting);
    if (!selecting) {
      selected.clear();
      U.$$('.shot-card.is-selected').forEach(function (card) { card.classList.remove('is-selected'); });
    }
    syncSelectionUI();
  }

  function toggleSelect(id) {
    if (!selecting) setSelecting(true);
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    var card = U.$('.shot-card[data-id="' + id + '"]', U.$('#gallery-groups'));
    if (card) card.classList.toggle('is-selected', selected.has(id));
    syncSelectionUI();
  }

  function syncSelectionUI() {
    var count = selected.size;
    var label = U.$('#selection-count');
    if (label) {
      label.textContent = count === 0 ? 'Nenhuma selecionada'
        : count === 1 ? '1 selecionada' : count + ' selecionadas';
    }
    var all = U.$('#select-all');
    if (all) {
      all.checked = count > 0 && count === items.length;
      all.indeterminate = count > 0 && count < items.length;
    }
    var download = U.$('#btn-download-selected');
    var del = U.$('#btn-delete-selected');
    if (download) download.disabled = count === 0;
    if (del) del.disabled = count === 0;
  }

  /* --------------------------- visualizador --------------------------- */

  function openViewer(id) {
    var index = items.findIndex(function (s) { return s.id === Number(id); });
    if (index < 0) return;
    viewerIndex = index;
    renderViewer();
    PF.modal.open('modal-viewer');
  }

  function renderViewer() {
    var shot = items[viewerIndex];
    if (!shot) return;
    var img = U.$('#viewer-img');
    var meta = U.$('#viewer-meta');
    var title = U.$('#viewer-title');
    if (img) {
      if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
      var url = URL.createObjectURL(shot.blob);
      img.src = url;
      img.dataset.url = url;
      img.alt = 'Captura de tela de ' + U.dateTime(shot.createdAt);
    }
    if (title) title.textContent = (U.extFor(shot.type) === 'jpg' ? 'JPG' : 'PNG') +
      ' · ' + (shot.width || '?') + '×' + (shot.height || '?');
    if (meta) {
      meta.textContent = U.dateTime(shot.createdAt) + ' · ' + U.fmtSize(shot.size) +
        ' · ' + (viewerIndex + 1) + ' de ' + items.length;
    }
    var prev = U.$('#viewer-prev');
    var next = U.$('#viewer-next');
    if (prev) prev.disabled = viewerIndex <= 0;
    if (next) next.disabled = viewerIndex >= items.length - 1;
  }

  function stepViewer(delta) {
    var target = viewerIndex + delta;
    if (target < 0 || target >= items.length) return;
    viewerIndex = target;
    renderViewer();
  }

  function currentShot() {
    return items[viewerIndex] || null;
  }

  /* ------------------------- exclusão / confirmação ------------------------- */

  function confirmAction(opts) {
    var modal = U.$('#modal-confirm');
    if (!modal) return Promise.resolve(false);
    U.$('#confirm-title').textContent = opts.title || 'Confirmar';
    U.$('#confirm-text').textContent = opts.text || 'Tem certeza?';
    var okBtn = U.$('#confirm-ok');
    okBtn.textContent = opts.okLabel || 'Confirmar';
    okBtn.className = 'btn ' + (opts.danger === false ? 'btn--primary' : 'btn--danger');

    PF.modal.open('modal-confirm');

    return new Promise(function (resolve) {
      confirmResolver = resolve;
    });
  }

  function resolveConfirm(value) {
    if (!confirmResolver) return;
    var fn = confirmResolver;
    confirmResolver = null;
    PF.modal.close('modal-confirm');
    fn(value);
  }

  async function deleteIds(ids) {
    if (!ids.length) return 0;
    var removedViewer = items[viewerIndex] && ids.indexOf(items[viewerIndex].id) >= 0;
    await PF.db.removeMany(ids);
    ids.forEach(function (id) { PF.db.releaseUrl(id); });
    selected.clear();

    if (removedViewer) PF.modal.close('modal-viewer');
    await refresh();
    PF.app.toast(ids.length === 1 ? 'Captura excluída.' : ids.length + ' capturas excluídas.', 'ok');
    return ids.length;
  }

  async function deleteCurrent() {
    var shot = currentShot();
    if (!shot) return;
    var ok = await confirmAction({
      title: 'Excluir captura',
      text: 'Esta captura será removida do dispositivo de forma permanente.',
      okLabel: 'Excluir'
    });
    if (ok) await deleteIds([shot.id]);
  }

  async function deleteSelected() {
    if (!selected.size) return;
    var ids = Array.from(selected);
    var ok = await confirmAction({
      title: 'Excluir ' + ids.length + (ids.length === 1 ? ' captura' : ' capturas'),
      text: 'As imagens selecionadas serão removidas permanentemente deste dispositivo.',
      okLabel: 'Excluir'
    });
    if (ok) {
      await deleteIds(ids);
      setSelecting(false);
    }
  }

  async function clearAll() {
    if (!items.length) {
      PF.app.toast('Não há capturas para apagar.', 'warn');
      return;
    }
    var ok = await confirmAction({
      title: 'Apagar todas as capturas',
      text: 'Todas as ' + items.length + ' capturas serão removidas permanentemente deste dispositivo. Considere baixar as imagens antes.',
      okLabel: 'Apagar tudo'
    });
    if (!ok) return;
    await PF.db.clear();
    PF.db.releaseAll();
    selected.clear();
    PF.modal.close('modal-viewer');
    await refresh();
    PF.app.toast('Todas as capturas foram apagadas.', 'ok');
  }

  /* ------------------------- ações em uma captura ------------------------- */

  async function shareOne(shot) {
    if (!shot) return;
    var result = await U.shareShot(shot);
    if (result === 'shared') PF.app.toast('Compartilhado.', 'ok');
    else if (result === 'unsupported') {
      U.downloadShot(shot);
      PF.app.toast('Compartilhamento nativo indisponível — imagem baixada.', 'warn');
    }
  }

  async function downloadMany(ids) {
    var list = items.filter(function (s) { return ids.indexOf(s.id) >= 0; });
    if (!list.length) return;
    for (var i = 0; i < list.length; i++) {
      U.downloadShot(list[i]);
      if (i < list.length - 1) await U.wait(320); // evita bloqueio de downloads múltiplos
    }
    PF.app.toast(list.length === 1 ? 'Download iniciado.' : list.length + ' downloads iniciados.', 'ok');
  }

  /* ------------------------------- dados ------------------------------- */

  async function load() {
    try {
      items = await PF.db.all();
    } catch (err) {
      items = [];
      PF.app.toast('Não foi possível ler o armazenamento local: ' + err.message, 'error');
    }
    return items;
  }

  async function refresh() {
    await load();
    renderLatest();
    renderGallery();
    PF.app.refreshStats(items);
    return items;
  }

  function snapshot() { return items.slice(); }

  /* ------------------------------ eventos ------------------------------ */

  function bind() {
    var selectAll = U.$('#select-all');
    if (selectAll) {
      selectAll.addEventListener('change', function () {
        if (selectAll.checked) items.forEach(function (s) { selected.add(s.id); });
        else selected.clear();
        renderGallery();
      });
    }

    var selBtn = U.$('#btn-select-mode');
    if (selBtn) {
      selBtn.addEventListener('click', function () {
        if (!items.length) { PF.app.toast('Nenhuma captura para selecionar.', 'warn'); return; }
        setSelecting(!selecting);
        renderGallery();
      });
    }

    var cancelSel = U.$('#btn-cancel-select');
    if (cancelSel) {
      cancelSel.addEventListener('click', function () {
        setSelecting(false);
        renderGallery();
      });
    }

    var delSel = U.$('#btn-delete-selected');
    if (delSel) delSel.addEventListener('click', deleteSelected);

    var dlSel = U.$('#btn-download-selected');
    if (dlSel) dlSel.addEventListener('click', function () {
      if (selected.size) downloadMany(Array.from(selected));
    });

    var prev = U.$('#viewer-prev');
    if (prev) prev.addEventListener('click', function () { stepViewer(-1); });
    var next = U.$('#viewer-next');
    if (next) next.addEventListener('click', function () { stepViewer(1); });

    var vDownload = U.$('#btn-viewer-download');
    if (vDownload) vDownload.addEventListener('click', function () {
      var shot = currentShot();
      if (shot) { U.downloadShot(shot); PF.app.toast('Download iniciado.', 'ok'); }
    });

    var vShare = U.$('#btn-viewer-share');
    if (vShare) vShare.addEventListener('click', function () { shareOne(currentShot()); });

    var vCopy = U.$('#btn-viewer-copy');
    if (vCopy) vCopy.addEventListener('click', async function () {
      var shot = currentShot();
      if (!shot) return;
      var ok = await U.copyShot(shot);
      PF.app.toast(ok ? 'Imagem copiada para a área de transferência.' :
        'Seu navegador não permitiu copiar a imagem.', ok ? 'ok' : 'warn');
    });

    var vDelete = U.$('#btn-viewer-delete');
    if (vDelete) vDelete.addEventListener('click', deleteCurrent);

    var okBtn = U.$('#confirm-ok');
    if (okBtn) okBtn.addEventListener('click', function () { resolveConfirm(true); });
    var cancelBtn = U.$('#confirm-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function () { resolveConfirm(false); });

    var confirmModal = U.$('#modal-confirm');
    if (confirmModal) {
      confirmModal.querySelectorAll('[data-close-modal]').forEach(function (node) {
        node.addEventListener('click', function () { resolveConfirm(false); });
      });
    }

    // Espelha "fechar" dos modais no visualizador (libera o Object URL)
    var viewerModal = U.$('#modal-viewer');
    if (viewerModal) {
      viewerModal.addEventListener('pf:modal-closed', function () {
        var img = U.$('#viewer-img');
        if (img && img.dataset.url) {
          URL.revokeObjectURL(img.dataset.url);
          delete img.dataset.url;
          img.removeAttribute('src');
        }
      });
    }

    var clearBtn = U.$('#btn-clear-all');
    if (clearBtn) clearBtn.addEventListener('click', clearAll);

    document.addEventListener('keydown', function (e) {
      if (!U.$('#modal-viewer').hidden) {
        if (e.key === 'ArrowLeft') stepViewer(-1);
        if (e.key === 'ArrowRight') stepViewer(1);
        if (e.key === 'Delete' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); deleteCurrent(); }
      } else if (U.$('#modal-confirm').hidden === false) {
        if (e.key === 'Enter') { e.preventDefault(); resolveConfirm(true); }
      }
    });
  }

  PF.gallery = {
    bind: bind,
    load: load,
    refresh: refresh,
    snapshot: snapshot,
    addAndRefresh: async function (record) {
      var saved = await PF.db.add(record);
      await refresh();
      return saved;
    },
    setSelecting: setSelecting,
    shareOne: shareOne,
    confirmAction: confirmAction,
    openViewer: openViewer
  };
})(window);
