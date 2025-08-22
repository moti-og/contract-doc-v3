// Legacy path retained; new canonical path is /web/superdoc-init.js

function detectCtor() {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  if (g.SuperDoc && typeof g.SuperDoc === 'function') return g.SuperDoc;
  if (g.superdoc) {
    if (typeof g.superdoc.SuperDoc === 'function') return g.superdoc.SuperDoc;
    if (typeof g.superdoc.default === 'function') return g.superdoc.default;
  }
  if (g.Superdoc && typeof g.Superdoc === 'function') return g.Superdoc;
  if (g.SuperDocLibrary) {
    if (typeof g.SuperDocLibrary.SuperDoc === 'function') return g.SuperDocLibrary.SuperDoc;
    if (typeof g.SuperDocLibrary.default === 'function') return g.SuperDocLibrary.default;
    if (typeof g.SuperDocLibrary === 'function') return g.SuperDocLibrary;
  }
  return null;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export async function ensureSuperDocLoaded() {
  if (detectCtor()) return;
  // Try minified first, then non-minified
  const candidates = [
    'https://cdn.jsdelivr.net/npm/@harbour-enterprises/superdoc/dist/superdoc.umd.min.js',
    'https://cdn.jsdelivr.net/npm/@harbour-enterprises/superdoc/dist/superdoc.umd.js',
  ];
  let lastErr;
  for (const url of candidates) {
    try {
      await loadScript(url);
      if (detectCtor()) return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('SuperDoc UMD not loaded');
}

/**
 * Mount SuperDoc with common defaults
 * @param {Object} options
 * @param {string} options.selector - CSS selector for editor container
 * @param {string} options.toolbar - CSS selector for toolbar container
 * @param {string|File|Object} options.document - URL, File, or SuperDoc doc config
 * @param {string} [options.documentMode] - 'editing' | 'viewing'
 * @param {boolean} [options.pagination]
 * @param {boolean} [options.rulers]
 */
export function mountSuperdoc(options) {
  const Ctor = detectCtor();
  if (!Ctor) throw new Error('SuperDoc UMD not loaded');
  const superdoc = new Ctor({
    selector: options.selector,
    toolbar: options.toolbar,
    document: options.document,
    documentMode: options.documentMode ?? 'editing',
    pagination: options.pagination ?? true,
    rulers: options.rulers ?? true,
    // Prefer same-origin collab proxy to avoid mixed content when server runs HTTPS
    collab: { url: 'wss://localhost:4001/collab' },
    onReady: (e) => console.log('SuperDoc ready', e),
    onEditorCreate: (e) => console.log('Editor created', e),
  });
  return superdoc;
}


