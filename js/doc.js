/* ==========================================================================
   Print Fácil — comportamento do guia Android
   Tema persistido (mesma chave do app) + botões de copiar código.
   ========================================================================== */
(function () {
  'use strict';

  var KEY = 'printfacil.settings.v1';

  function readTheme() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return 'dark';
      var parsed = JSON.parse(raw);
      return (parsed && parsed.theme) || 'dark';
    } catch (err) { return 'dark'; }
  }

  function applyTheme() {
    var pref = readTheme();
    var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
    var theme = pref === 'system' ? (media && media.matches ? 'light' : 'dark') : pref;
    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f5f7fc' : '#0a0c12');
  }

  function toast(message) {
    var stack = document.getElementById('toast-stack');
    if (!stack) return;
    var node = document.createElement('div');
    node.className = 'toast';
    node.setAttribute('role', 'status');
    node.innerHTML = '<span class="toast__dot" aria-hidden="true"></span><span></span>';
    node.lastChild.textContent = message;
    stack.appendChild(node);
    setTimeout(function () {
      node.classList.add('toast--out');
      setTimeout(function () { node.remove(); }, 250);
    }, 2200);
  }

  function bindCopy() {
    document.querySelectorAll('[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var wrap = btn.closest('.code-wrap');
        var codeEl = wrap ? wrap.querySelector('code') : null;
        if (!codeEl) return;
        var text = codeEl.textContent;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
          } else {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
          }
          var original = btn.textContent;
          btn.textContent = 'COPIADO';
          setTimeout(function () { btn.textContent = original; }, 1600);
        } catch (err) {
          toast('Não foi possível copiar automaticamente.');
        }
      });
    });
  }

  applyTheme();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindCopy);
  } else {
    bindCopy();
  }
})();
