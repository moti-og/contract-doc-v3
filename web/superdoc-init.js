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
  // Prefer local vendored UMD first, then fall back to CDN
  const candidates = [
    '/vendor/superdoc/superdoc.umd.min.js?v=exporter-m7',
    '/vendor/superdoc/superdoc.umd.js?v=exporter-m7',
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
  // Expose a small export API for the React right-pane to use for Save Progress
  try {
    if (typeof window !== 'undefined') {
      window.superdocInstance = superdoc;
      window.superdocAPI = window.superdocAPI || {};
      // Helper: Blob -> base64 string
      const blobToBase64 = (blob) => new Promise((resolve, reject) => {
        try {
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result || '';
            const base64 = String(dataUrl).split(',')[1] || '';
            resolve(base64);
          };
          reader.onerror = (e) => reject(e);
          reader.readAsDataURL(blob);
        } catch (e) { reject(e); }
      });
      // Fallback: capture bytes from download-only export() by temporarily
      // wrapping download primitives during the export call, and suppressing
      // the actual user-visible download for blob:/data: targets.
      const captureExportDownloadToBase64 = async () => {
        let capturedBlob = null;
        let capturedHref = null;
        const orig = {
          createURL: URL.createObjectURL,
          aClick: HTMLAnchorElement.prototype.click,
          open: window.open,
        };
        try {
          URL.createObjectURL = function(arg) {
            try { if (arg instanceof Blob) capturedBlob = arg; } catch {}
            return orig.createURL.apply(this, arguments);
          };
          HTMLAnchorElement.prototype.click = function() {
            try { capturedHref = String(this.href || '');
              if (capturedHref.startsWith('blob:') || capturedHref.startsWith('data:')) {
                // Suppress the actual download for blob:/data: targets
                return;
              }
            } catch {}
            return orig.aClick.apply(this, arguments);
          };
          window.open = function(u, ...rest) {
            try { if (typeof u === 'string') capturedHref = u; } catch {}
            if (typeof u === 'string' && (u.startsWith('blob:') || u.startsWith('data:'))){
              // Suppress the popup for blob:/data: targets
              return null;
            }
            return orig.open.apply(this, [u, ...rest]);
          };

          if (typeof superdoc.export === 'function') {
            await superdoc.export();
          }
        } catch {}
        finally {
          try { URL.createObjectURL = orig.createURL; } catch {}
          try { HTMLAnchorElement.prototype.click = orig.aClick; } catch {}
          try { window.open = orig.open; } catch {}
        }

        // Prefer captured Blob; else data URL; else fetch http(s)
        try {
          if (capturedBlob) return await blobToBase64(capturedBlob);
          if (capturedHref && capturedHref.startsWith('data:')) {
            return String(capturedHref).split(',')[1] || '';
          }
          if (capturedHref && /^https?:/i.test(capturedHref)) {
            // Best effort: only works with same-origin/CORS-enabled URLs
            try {
              const res = await fetch(capturedHref, { credentials: 'include', cache: 'no-store' });
              if (res.ok) {
                const blob = await res.blob();
                return await blobToBase64(blob);
              }
            } catch {}
          }
        } catch {}
        return null;
      };
      // Per SuperDoc docs: use exportDocx()/exportPdf() to obtain a Blob
      // https://docs.superdoc.dev/guide/resources#implementing-export-functionality
      window.superdocAPI.export = async (format = 'docx') => {
        try {
          if (format === 'docx' && typeof superdoc.exportDocx === 'function') {
            const blob = await superdoc.exportDocx();
            return await blobToBase64(blob);
          }
          if (format === 'pdf' && typeof superdoc.exportPdf === 'function') {
            const blob = await superdoc.exportPdf();
            return await blobToBase64(blob);
          }
          // Fallback: if only export() is available (download), capture bytes
          if (typeof superdoc.export === 'function') {
            const b64 = await captureExportDownloadToBase64();
            if (b64) return b64;
          }
        } catch {}
        return null;
      };
    }
  } catch {}
  return superdoc;
}


// Bridge for React-controlled hosting from the right pane
try {
  if (typeof window !== 'undefined') {
    const g = window;
    g.SuperDocBridge = g.SuperDocBridge || {};
    g.SuperDocBridge.mount = function mount(opts = {}) {
      const selector = opts.selector || '#superdoc';
      const toolbar = opts.toolbar || '#superdoc-toolbar';
      const doc = opts.document || undefined;
      const mode = opts.documentMode || 'editing';
      try { g.superdocInstance = mountSuperdoc({ selector, toolbar, document: doc, documentMode: mode, pagination: true, rulers: true }); } catch {}
      return g.superdocInstance || null;
    };
    g.SuperDocBridge.open = function open(doc) {
      const selector = '#superdoc';
      const toolbar = '#superdoc-toolbar';
      try {
        const oldToolbar = document.getElementById('superdoc-toolbar');
        const oldContainer = document.getElementById('superdoc');
        const newToolbar = document.createElement('div'); newToolbar.id = 'superdoc-toolbar';
        const newContainer = document.createElement('div'); newContainer.id = 'superdoc'; newContainer.style.flex = '1';
        oldToolbar?.replaceWith(newToolbar); oldContainer?.replaceWith(newContainer);
      } catch {}
      try { g.superdocInstance = mountSuperdoc({ selector, toolbar, document: doc, documentMode: 'editing', pagination: true, rulers: true }); } catch {}
      return g.superdocInstance || null;
    };
    g.SuperDocBridge.destroy = function destroy() {
      try { if (g.superdocInstance && typeof g.superdocInstance.destroy === 'function') g.superdocInstance.destroy(); } catch {}
      g.superdocInstance = null;
    };
  }
} catch {}


