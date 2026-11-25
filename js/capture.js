/* ==========================================================================
   Print Fácil — captura real de tela
   Usa a Screen Capture API (navigator.mediaDevices.getDisplayMedia), que exige
   autorização explícita do usuário: o navegador sempre pergunta qual tela ou
   janela compartilhar. Não existe captura silenciosa de tela na web.

   Nada é simulado: se a API não estiver disponível, o app informa claramente
   em vez de gerar uma imagem falsa.
   ========================================================================== */
(function (global) {
  'use strict';

  var PF = global.PF || (global.PF = {});
  var U = PF.util;

  var activeStream = null;
  var busy = false;

  function isSupported() {
    return !!(navigator.mediaDevices &&
      typeof navigator.mediaDevices.getDisplayMedia === 'function');
  }

  /**
   * Diagnóstico de disponibilidade com motivo legível.
   * state: 'ready' | 'warn' | 'blocked'
   */
  function availability() {
    var secure = global.isSecureContext !== false;
    var hasApi = isSupported();

    if (!hasApi) {
      return {
        state: 'blocked',
        supported: false,
        text: secure
          ? 'Captura de tela indisponível neste navegador'
          : 'Captura exige HTTPS (conexão segura)'
      };
    }
    if (!secure) {
      return { state: 'warn', supported: false, text: 'Captura exige HTTPS para funcionar' };
    }
    var ua = navigator.userAgent || '';
    var isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (isIOS) {
      return {
        state: 'warn',
        supported: true,
        text: 'No iOS a captura pelo navegador é limitada'
      };
    }
    return { state: 'ready', supported: true, text: 'Captura de tela disponível' };
  }

  /** Espera o elemento <video> ter um quadro válido e dimensões. */
  function waitForFrame(video, timeoutMs) {
    var deadline = Date.now() + (timeoutMs || 8000);
    return new Promise(function (resolve, reject) {
      (function check() {
        if (video.videoWidth > 0 && video.videoHeight > 0) return resolve();
        if (Date.now() > deadline) {
          return reject(new Error('A fonte compartilhada não enviou imagem.'));
        }
        setTimeout(check, 60);
      })();
    });
  }

  function stopActiveStream() {
    if (!activeStream) return;
    try {
      activeStream.getTracks().forEach(function (track) { track.stop(); });
    } catch (err) { /* ignora */ }
    activeStream = null;
  }

  function friendlyError(err) {
    var name = (err && err.name) || '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return {
        title: 'Permissão não concedida',
        detail: 'A captura foi cancelada ou negada. Toque em capturar e escolha uma tela ou janela na janela do sistema.'
      };
    }
    if (name === 'AbortError') {
      return {
        title: 'Captura interrompida',
        detail: 'A seleção de tela foi fechada antes de concluir. Tente novamente.'
      };
    }
    if (name === 'NotFoundError') {
      return {
        title: 'Nenhuma tela disponível',
        detail: 'O sistema não encontrou uma fonte para compartilhar.'
      };
    }
    if (name === 'NotReadableError') {
      return {
        title: 'Não foi possível ler a tela',
        detail: 'Outro aplicativo pode estar usando o compartilhamento de tela.'
      };
    }
    if (name === 'InvalidStateError') {
      return {
        title: 'Captura não permitida aqui',
        detail: 'A página precisa estar em foco e ativa. Volte ao app e tente de novo.'
      };
    }
    return {
      title: 'Não foi possível capturar',
      detail: (err && err.message) || 'Erro desconhecido durante a captura.'
    };
  }

  /** Recorta a área de vídeo para um canvas no formato escolhido. */
  function grabFrame(video, settings) {
    var format = settings.format === 'jpg' ? 'image/jpeg' : 'image/png';
    var quality = Math.min(1, Math.max(0.4, (settings.quality || 92) / 100));

    var width = video.videoWidth;
    var height = video.videoHeight;
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    var ctx = canvas.getContext('2d', { alpha: format === 'image/png' });
    if (format === 'image/jpeg') {
      // JPEG não tem transparência: fundo branco evita áreas pretas.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(video, 0, 0, width, height);

    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) return reject(new Error('Falha ao gerar a imagem.'));
        resolve({ blob: blob, width: width, height: height, type: format });
      }, format, format === 'image/jpeg' ? quality : undefined);
    });
  }

  /**
   * Fluxo completo de captura.
   * onStage(texto) permite a UI mostrar o progresso real.
   * Resolve com { blob, width, height, type } ou null se o usuário cancelar.
   */
  async function capture(options) {
    var opts = options || {};
    var settings = PF.settings.get();
    var onStage = typeof opts.onStage === 'function' ? opts.onStage : function () {};

    if (busy) return { cancelled: true, reason: 'busy' };

    if (!isSupported()) {
      var why = friendlyError({ name: 'NotSupportedError', message: 'getDisplayMedia indisponível.' });
      throw Object.assign(new Error(why.detail), { friendly: why });
    }

    busy = true;
    var stream = null;
    var video = null;

    try {
      onStage('Aguardando autorização do navegador…');

      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: false,
        // Dicas opcionais: navegadores que não as conhecem simplesmente as ignoram.
        selfBrowserSurface: 'include',
        surfaceSwitching: 'include',
        monitorTypeSurfaces: 'include'
      });

      activeStream = stream;

      var liveTrack = stream.getVideoTracks()[0];
      if (!liveTrack) throw new Error('Nenhuma trilha de vídeo recebida.');
      if (liveTrack.readyState === 'ended') {
        return { cancelled: true, reason: 'ended' };
      }

      onStage('Preparando a imagem…');

      video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;

      await new Promise(function (resolve, reject) {
        video.onloadedmetadata = function () { resolve(); };
        video.onerror = function () { reject(new Error('Falha ao ler o vídeo da tela.')); };
        var playResult = video.play();
        if (playResult && typeof playResult.catch === 'function') {
          playResult.catch(function () { /* autoplay silencioso normalmente é permitido */ });
        }
        setTimeout(resolve, 1500);
      });

      await waitForFrame(video, 9000);

      // Último aviso de UI ANTES de esconder: nada do app deve ser desenhado
      // entre o hideChrome() e a leitura do quadro, senão o overlay de progresso
      // ou o botão flutuante apareceriam no print.
      onStage('Capturando…');

      if (opts.hideChrome) {
        opts.hideChrome();
        await U.nextFrame();
        await U.wait(110);
      }

      var frame = await grabFrame(video, settings);

      if (opts.restoreChrome) opts.restoreChrome();

      return frame;
    } catch (err) {
      if (opts.restoreChrome) opts.restoreChrome();
      if (err && err.name === 'NotAllowedError') {
        return { cancelled: true, reason: 'denied', error: friendlyError(err) };
      }
      if (err && err.friendly) throw err;
      throw Object.assign(err, { friendly: friendlyError(err) });
    } finally {
      if (video) {
        video.pause();
        video.srcObject = null;
      }
      if (stream) {
        stream.getTracks().forEach(function (track) {
          track.onended = null;
          try { track.stop(); } catch (e) { /* ignora */ }
        });
      }
      activeStream = null;
      busy = false;
    }
  }

  /** Importação explícita de arquivo — nunca apresentada como captura de tela. */
  function importFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error('Nenhum arquivo selecionado.'));
      if (!/^image\//.test(file.type)) {
        return reject(new Error('Selecione um arquivo de imagem (PNG ou JPG).'));
      }
      var settings = PF.settings.get();
      var wantJpeg = settings.format === 'jpg';
      var needsConvert = wantJpeg ? !/jpe?g/.test(file.type) : !/png/.test(file.type);

      if (!needsConvert) {
        var img = new Image();
        var url = URL.createObjectURL(file);
        img.onload = function () {
          URL.revokeObjectURL(url);
          resolve({ blob: file, width: img.naturalWidth, height: img.naturalHeight, type: file.type, source: 'import' });
        };
        img.onerror = function () {
          URL.revokeObjectURL(url);
          resolve({ blob: file, width: 0, height: 0, type: file.type, source: 'import' });
        };
        img.src = url;
        return;
      }

      var bitmapUrl = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        var ctx = canvas.getContext('2d');
        if (wantJpeg) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        ctx.drawImage(image, 0, 0);
        var mime = wantJpeg ? 'image/jpeg' : 'image/png';
        canvas.toBlob(function (blob) {
          URL.revokeObjectURL(bitmapUrl);
          resolve({
            blob: blob || file,
            width: canvas.width,
            height: canvas.height,
            type: mime,
            source: 'import'
          });
        }, mime, (settings.quality || 92) / 100);
      };
      image.onerror = function () {
        URL.revokeObjectURL(bitmapUrl);
        reject(new Error('Não foi possível ler essa imagem.'));
      };
      image.src = bitmapUrl;
    });
  }

  function isBusy() { return busy; }

  PF.capture = {
    isSupported: isSupported,
    availability: availability,
    capture: capture,
    importFile: importFile,
    stop: stopActiveStream,
    isBusy: isBusy,
    friendlyError: friendlyError
  };
})(window);
