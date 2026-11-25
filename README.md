# Print Fácil — captura de tela em um toque

Aplicativo web (PWA) de captura de tela com **botão flutuante arrastável**, galeria local
organizada por data e configurações de aparência/captura. HTML5, CSS3 e JavaScript puro —
sem frameworks, sem build, sem backend.

> **Privacidade:** nenhuma captura sai do dispositivo. Não há requisições de rede com
> imagens, nem upload para servidor. Tudo fica no IndexedDB do próprio navegador.

---

## Como rodar

Arquivos estáticos. Basta abrir `index.html` em um servidor local/HTTPS.

```bash
# qualquer servidor estático, por exemplo:
python3 -m http.server 8080
# depois: http://localhost:8080/index.html
```

**A captura de tela exige contexto seguro (HTTPS ou `localhost`)** — é uma restrição da
Screen Capture API do navegador, não do app. Sem isso, o chip de status mostra
"Captura exige HTTPS" e o botão principal fica desativado.

---

## Páginas e rotas

| Caminho | Descrição |
| --- | --- |
| `index.html` | App completo (views Início / Minhas capturas / Ajustes) |
| `index.html#/home` | Tela inicial: logo, botão de captura, status, últimas capturas |
| `index.html#/gallery` | Galeria agrupada por data, seleção múltipla, visualizador |
| `index.html#/settings` | Ajustes do botão flutuante, captura, tema e dados |
| `android.html` | Guia técnico da camada nativa Android (overlay + MediaProjection) |
| `manifest.webmanifest` | Manifesto PWA (instalável, atalhos, ícones) |
| `sw.js` | Service worker (app shell offline) |

---

## Estrutura de arquivos

```
index.html                  # interface principal
android.html                # guia Android
manifest.webmanifest
sw.js                       # cache offline do app shell
css/
  style.css                 # design system, temas claro/escuro, botão flutuante
  doc.css                   # estilos do guia Android
js/
  utils.js                  # datas em pt-BR, tamanhos, download, share, clipboard
  db.js                     # IndexedDB: CRUD de capturas + cache de Object URLs
  settings.js               # preferências versionadas em localStorage + tema
  capture.js                # Screen Capture API real -> Blob PNG/JPG
  fab.js                    # botão flutuante: arrasto, posição, tamanho, opacidade
  gallery.js                # galeria, seleção múltipla, visualizador, exclusão
  app.js                    # rotas, modais, toasts, orquestração da captura
  doc.js                    # tema + copiar código no guia Android
icons/
  icon.svg                  # ícone do app
  icon-maskable.svg         # ícone maskable (Android)
```

---

## Funcionalidades implementadas

### Botão flutuante
- Circular, ícone de câmera, gradiente, sombra suave e anel pulsante.
- **Arrastável** com mouse, toque (Pointer Events) e **teclado** (setas movem, Shift = passo maior).
- Distingue **toque** de **arrasto** (limiar de 7 px) para não capturar sem querer.
- Posição, tamanho (44–96 px) e transparência (35–100%) **persistidos** em `localStorage`.
- Reancorado dentro da viewport ao girar o dispositivo ou redimensionar a janela.
- Animação de pressão + vibração (quando suportada). Badge com o total de capturas.

### Captura real
- Usa `navigator.mediaDevices.getDisplayMedia` — o navegador **sempre** pede autorização e
  o usuário escolhe tela/janela/aba. Não existe captura silenciosa na web.
- Fluxo: pedido de permissão → `<video>` da stream → espera de quadro válido → esconde o
  botão flutuante e o overlay → desenha no `<canvas>` → `toBlob` em **PNG** ou **JPG**
  (com qualidade configurável).
- Tratamento de erros por `DOMException`: `NotAllowedError`, `AbortError`, `NotFoundError`,
  `NotReadableError`, `InvalidStateError` — cada um com mensagem clara em português.
- Caminho alternativo explícito: **importar arquivo** de imagem (marcado como
  `source: 'import'`, nunca apresentado como print de tela).

### Galeria "Minhas capturas"
- Miniaturas em grid, **agrupadas por data** (Hoje / Ontem / dia da semana / data completa).
- Metadados por item: hora, formato, tamanho, dimensões.
- **Visualizador em tela cheia** com navegação anterior/próxima e atalhos ← →.
- **Seleção múltipla** (botão Selecionar, Ctrl/Cmd+clique, "Selecionar tudo") com exclusão
  e download em lote.
- Download, **compartilhamento nativo** (`navigator.share` com arquivo), **copiar imagem**
  para a área de transferência, exclusão individual e exclusão total.
- Confirmação obrigatória antes de qualquer exclusão.

### Configurações
Exibir/ocultar o botão · tamanho · transparência · posição inicial (5 cantos) · vibração ·
formato PNG/JPG · qualidade (40–100%) · ocultar botão na captura · salvar automaticamente ·
tema claro/escuro/sistema · restaurar padrões.

### Interface
Minimalista, escura por padrão com tema claro completo, tipografia Inter/system-ui,
gradientes suaves, glassmorphism no header, navegação inferior em telas pequenas,
modais com trap de foco e `Escape`, toasts acessíveis (`aria-live`), `prefers-reduced-motion`
respeitado e layout responsivo de 320 px a desktops largos.

### PWA e offline
- Manifesto com atalhos ("Nova captura", "Minhas capturas") e ícones normal + maskable.
- Service worker: navegação *network-first*, estáticos *cache-first* com revalidação.
- Capturas já salvas são visualizáveis **sem internet** (IndexedDB é local).

---

## Modelo de dados

### IndexedDB — banco `printfacil`, versão 1, store `shots` (keyPath `id`, autoIncrement)

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `id` | number | chave auto-incremental |
| `createdAt` | number | timestamp em ms (índice `createdAt`) |
| `type` | string | `image/png` ou `image/jpeg` |
| `width`, `height` | number | dimensões em px |
| `size` | number | bytes do Blob |
| `source` | string | `screen` (captura real) ou `import` (arquivo) |
| `blob` | Blob | imagem binária — **único** local onde a imagem existe |

Miniaturas usam `URL.createObjectURL` com cache por id, liberado na exclusão e ao fechar o
visualizador. Nenhuma imagem é gravada em `localStorage`, base64 ou no HTML.

### localStorage — chave `printfacil.settings.v1`

`fabEnabled`, `fabSize` (44–96), `fabOpacity` (0.35–1), `fabHome` (`br|bl|tr|tl|mr`),
`fabX`/`fabY` (posição arrastada), `format` (`png|jpg`), `quality` (40–100), `hideFab`,
`autosave`, `vibrate`, `theme` (`dark|light|system`).

Leitura sempre mesclada com os padrões, então adicionar novas chaves nunca quebra
preferências existentes. Em modo privado, falhas de escrita são toleradas em memória.

---

## Limite importante: botão sobre *outros* aplicativos

Isto **não é possível em HTML**, nem em PWA instalado. Uma página web não pode desenhar
acima de outros apps nem ler o framebuffer do sistema. O app web cobre 100% do que a
plataforma permite; o requisito 8 do projeto é atendido por um **guia de implementação
nativo completo** em `android.html`, com:

- `SYSTEM_ALERT_WINDOW` + `ACTION_MANAGE_OVERLAY_PERMISSION` (permissão por Ajustes do sistema);
- serviço em primeiro plano com `foregroundServiceType="mediaProjection"` e notificação;
- overlay via `WindowManager.addView` com `TYPE_APPLICATION_OVERLAY`, arrasto por
  `OnTouchListener` e posição salva;
- `ScreenCaptureManager` com uma sessão de `MediaProjection`, `VirtualDisplay` +
  `ImageReader`, extração de `Bitmap` e compressão PNG/JPG;
- ponte `@JavascriptInterface` (`PrintFacilNative`) + retorno por `evaluateJavascript`,
  com o WebView reutilizando este mesmo front-end e a mesma galeria IndexedDB.

Código Kotlin, XML e JS completos e comentados estão naquela página (com botão copiar).

---

## Verificação realizada

- Console do navegador limpo em `index.html` e `android.html`.
- Renderização conferida em **desktop (1280×800)** e **mobile (390×844)** — home, galeria
  com dados, estado vazio, visualizador, modo de seleção, ajustes e guia Android.
- Fluxo de captura testado quanto a estados de erro; a autorização real depende do
  navegador do usuário (diálogo do sistema).

---

## Próximos passos sugeridos

1. Empacotar em Android (WebView + `FloatingButtonService` + `ScreenCaptureManager`) seguindo `android.html`.
2. Exportar/importar a galeria em JSON/ZIP para backup manual entre dispositivos.
3. Marcações (favoritos, tags) e busca por data na galeria.
4. Editor leve: recorte e anotações antes de salvar.
5. Instalar como PWA e adicionar screenshots reais ao manifesto para a loja de apps.
