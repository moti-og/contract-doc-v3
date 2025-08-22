// React entry (UMD) for shared UI. Safe to include even if React is missing.
// Exposes window.mountReactApp({ rootSelector }) for progressive migration.

(function (global) {
  const win = typeof global !== 'undefined' ? global : (typeof window !== 'undefined' ? window : this);

  function getApiBase() {
    try {
      const src = Array.from(document.scripts).map(s => s.src).find(u => typeof u === 'string' && /(^|\/)components\.react\.js(\?|$)/.test(u));
      if (src) return new URL(src).origin;
    } catch {}
    try { return location.origin; } catch {}
    return 'https://localhost:4001';
  }

  function mountReactApp(opts) {
    const options = opts || {};
    const selector = options.rootSelector || '#app-root';
    const rootEl = document.querySelector(selector);
    if (!rootEl) { try { console.warn('[react-entry] root not found', selector); } catch (_) {} return; }
    if (!win.React || !win.ReactDOM || !win.ReactDOM.createRoot) {
      try { console.warn('[react-entry] React/ReactDOM not available; did you preload /vendor/react/*?'); } catch (_) {}
      return; // Graceful no-op
    }

    const React = win.React;
    const ReactDOM = win.ReactDOM;

    const ThemeContext = React.createContext({ tokens: null });
    const StateContext = React.createContext({ config: null, revision: 0, actions: {} });

    function ThemeProvider(props) {
      const [tokens, setTokens] = React.useState(null);
      React.useEffect(() => {
        const API_BASE = getApiBase();
        (async () => {
          try { const r = await fetch(`${API_BASE}/api/v1/theme`); if (r.ok) setTokens(await r.json()); } catch {}
        })();
      }, []);
      return React.createElement(ThemeContext.Provider, { value: { tokens } }, props.children);
    }

    function StateProvider(props) {
      const [config, setConfig] = React.useState(null);
      const [revision, setRevision] = React.useState(0);
      const API_BASE = getApiBase();

      const refresh = React.useCallback(async () => {
        try { const r = await fetch(`${API_BASE}/api/v1/state-matrix?platform=web&userId=user1`); if (r.ok) { const j = await r.json(); setConfig(j.config || null); if (typeof j.revision === 'number') setRevision(j.revision); } } catch {}
      }, [API_BASE]);

      React.useEffect(() => {
        refresh();
        let sse;
        try {
          sse = new EventSource(`${API_BASE}/api/v1/events`);
          sse.onmessage = (ev) => {
            try { const p = JSON.parse(ev.data); if (typeof p.revision === 'number') setRevision(p.revision); refresh(); } catch {}
          };
        } catch {}
        return () => { try { sse && sse.close(); } catch {} };
      }, [API_BASE, refresh]);

      const actions = React.useMemo(() => ({
        finalize: async (userId) => { try { await fetch(`${API_BASE}/api/v1/finalize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: userId || 'user1' }) }); await refresh(); } catch {} },
      }), [API_BASE, refresh]);

      return React.createElement(StateContext.Provider, { value: { config, revision, actions } }, props.children);
    }

    function BannerStack() {
      const { tokens } = React.useContext(ThemeContext);
      const { config } = React.useContext(StateContext);
      const banners = Array.isArray(config?.banners) ? config.banners : [];
      return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' } },
        banners.map((b, i) => {
          const t = (tokens && tokens.banner && b && b.state) ? tokens.banner[b.state] : null;
          const style = {
            marginTop: '0px', background: (t && t.pillBg) || '#eef2ff', color: (t && t.pillFg) || '#1e3a8a',
            border: `1px solid ${(t && t.pillBg) || '#c7d2fe'}`, borderRadius: '6px', padding: '3px 8px', fontWeight: 600, width: '90%', textAlign: 'center'
          };
          const text = (b.title && b.message) ? `${b.title}: ${b.message}` : (b.title || '');
          return React.createElement('div', { key: `b-${i}`, style }, text);
        })
      );
    }

    function SendVendorModal(props) {
      const { onClose, userId } = props || {};
      const [schema, setSchema] = React.useState(null);
      const [values, setValues] = React.useState({});
      const API_BASE = getApiBase();

      React.useEffect(() => {
        (async () => {
          try { const r = await fetch(`${API_BASE}/api/v1/ui/modal/send-vendor?userId=${encodeURIComponent(userId || 'user1')}`); if (r.ok) { const j = await r.json(); setSchema(j.schema || null); } } catch {}
        })();
      }, [API_BASE, userId]);

      if (!schema) return null;
      const t = schema.theme || {};
      const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 };
      const panelStyle = { width: (schema.style?.width || 720) + 'px', maxWidth: '95vw', background: t.background || '#fff', border: `1px solid ${t.border || '#e5e7eb'}`, borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' };
      const headerStyle = { padding: '14px 16px', borderBottom: `1px solid ${t.border || '#e5e7eb'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: t.headerBg || '#fff', color: t.headerFg || '#111827' };
      const bodyStyle = { padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' };
      const footerStyle = { padding: '12px 16px', borderTop: `1px solid ${t.border || '#e5e7eb'}`, display: 'flex', justifyContent: 'flex-end', gap: '8px' };

      const setField = (name, val) => setValues(v => ({ ...v, [name]: val }));
      const onAction = async (actionId) => {
        if (actionId === 'cancel') return onClose?.();
        if (actionId === 'save') {
          try {
            const body = { ...values, userId: userId || 'user1' };
            const r = await fetch(`${API_BASE}/api/v1/send-vendor`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!r.ok) throw new Error('send-vendor');
          } catch {}
          return onClose?.();
        }
        onClose?.();
      };

      return React.createElement('div', { style: overlayStyle, onClick: (e) => { if (e.target === e.currentTarget) onClose?.(); } },
        React.createElement('div', { style: panelStyle }, [
          React.createElement('div', { key: 'h', style: headerStyle }, [
            React.createElement('div', { key: 't', style: { fontWeight: 700 } }, schema.title || 'Modal'),
            React.createElement('button', { key: 'x', onClick: () => onClose?.(), style: { border: 'none', background: 'transparent' } }, '✕')
          ]),
          React.createElement('div', { key: 'b', style: bodyStyle }, [
            schema.description ? React.createElement('div', { key: 'd', style: { color: t.muted || '#6b7280' } }, schema.description) : null,
            React.createElement('div', { key: 'f', style: { display: 'grid', gridTemplateColumns: '1fr', gap: '12px' } },
              (Array.isArray(schema.fields) ? schema.fields : []).map((f, i) => React.createElement('div', { key: `r-${i}`, style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, [
                React.createElement('label', { key: 'l', style: { fontSize: '12px', color: t.muted || '#6b7280' } }, f.label || f.name),
                (f.type === 'textarea'
                  ? React.createElement('textarea', { key: 'i', rows: 4, placeholder: f.placeholder || '', defaultValue: f.value || '', maxLength: f.maxLength || undefined, style: { padding: '8px', border: `1px solid ${t.border || '#e5e7eb'}`, borderRadius: '6px' }, onChange: (e) => setField(f.name, e.target.value) })
                  : React.createElement('input', { key: 'i', type: 'text', placeholder: f.placeholder || '', defaultValue: f.value || '', style: { padding: '8px', border: `1px solid ${t.border || '#e5e7eb'}`, borderRadius: '6px' }, onChange: (e) => setField(f.name, e.target.value) })
                )
              ]))
            )
          ]),
          React.createElement('div', { key: 'f2', style: footerStyle },
            (Array.isArray(schema.actions) ? schema.actions : []).map((a, i) => React.createElement('button', { key: `a-${i}`, onClick: () => onAction(a.id), style: (a.variant === 'primary') ? { background: t.primary || '#111827', color: '#fff', border: `1px solid ${t.primary || '#111827'}` } : {} }, a.label || a.id))
          )
        ])
      );
    }

    function App() {
      const [modal, setModal] = React.useState(null);
      React.useEffect(() => {
        function onOpen(ev) { try { const d = ev.detail || {}; if (d && (d.id === 'send-vendor' || d.id === 'sendVendor')) setModal({ id: 'send-vendor', userId: d.options?.userId || 'user1' }); } catch {} }
        window.addEventListener('react:open-modal', onOpen);
        return () => window.removeEventListener('react:open-modal', onOpen);
      }, []);
      return React.createElement(ThemeProvider, null,
        React.createElement(StateProvider, null,
          React.createElement(React.Fragment, null,
            React.createElement(BannerStack, null),
            modal ? React.createElement(SendVendorModal, { userId: modal.userId, onClose: () => setModal(null) }) : null
          )
        )
      );
    }

    const root = ReactDOM.createRoot(rootEl);
    root.render(React.createElement(App, null));
  }

  try {
    win.mountReactApp = mountReactApp;
    win.openReactModal = function(id, options) {
      try { window.dispatchEvent(new CustomEvent('react:open-modal', { detail: { id, options: options || {} } })); } catch {}
    };
  } catch (_) {}
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));


