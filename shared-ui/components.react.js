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
    if (!win.React || !win.ReactDOM || !win.ReactDOM.createRoot || win.React.__placeholder || win.ReactDOM.__placeholder) {
      try { console.warn('[react-entry] React/ReactDOM not available; did you preload /vendor/react/*?'); } catch (_) {}
      return; // Graceful no-op
    }

    const React = win.React;
    const ReactDOM = win.ReactDOM;

    const ThemeContext = React.createContext({ tokens: null });
    const StateContext = React.createContext({
      config: null,
      revision: 0,
      actions: {},
      isConnected: false,
      lastTs: 0,
      currentUser: 'user1',
      currentRole: 'editor',
      users: [],
      setUser: () => {},
    });

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
      const [isConnected, setIsConnected] = React.useState(false);
      const [lastTs, setLastTs] = React.useState(0);
      const [userId, setUserId] = React.useState('user1');
      const [role, setRole] = React.useState('editor');
      const [users, setUsers] = React.useState([]);
      const API_BASE = getApiBase();

      const refresh = React.useCallback(async () => {
        try { const r = await fetch(`${API_BASE}/api/v1/state-matrix?platform=web&userId=${encodeURIComponent(userId)}`); if (r.ok) { const j = await r.json(); setConfig(j.config || null); if (typeof j.revision === 'number') setRevision(j.revision); } } catch {}
      }, [API_BASE, userId]);

      React.useEffect(() => {
        // Load users for selector (role comes from users.json)
        (async () => {
          try {
            const r = await fetch(`${API_BASE}/api/v1/users`);
            if (r.ok) {
              const j = await r.json();
              const items = Array.isArray(j.items) ? j.items : [];
              setUsers(items);
              if (items.length) {
                const me = items.find(u => (u.id || u.label) === userId) || items[0];
                setUserId(me.id || me.label);
                setRole(me.role || 'editor');
              }
            }
          } catch {}
        })();
        refresh();
        let sse;
        try {
          sse = new EventSource(`${API_BASE}/api/v1/events`);
          sse.onopen = () => setIsConnected(true);
          sse.onmessage = (ev) => {
            try { const p = JSON.parse(ev.data); if (p && p.ts) setLastTs(p.ts); if (typeof p.revision === 'number') setRevision(p.revision); refresh(); } catch {}
          };
          sse.onerror = () => setIsConnected(false);
        } catch {}
        return () => { try { sse && sse.close(); } catch {} };
      }, [API_BASE, refresh]);

      async function exportWordDocumentAsBase64() {
        return new Promise((resolve, reject) => {
          try {
            if (typeof Office === 'undefined') return reject('no_office');
            const sliceSize = 1024 * 64;
            Office.context.document.getFileAsync(Office.FileType.Compressed, { sliceSize }, (result) => {
              if (result.status !== Office.AsyncResultStatus.Succeeded) return reject('getFile_failed');
              const file = result.value;
              const sliceCount = file.sliceCount;
              const slices = [];
              let index = 0;
              const next = () => {
                file.getSliceAsync(index, (res) => {
                  if (res.status !== Office.AsyncResultStatus.Succeeded) { try { file.closeAsync(); } catch {}; return reject('getSlice_failed'); }
                  slices.push(res.value.data); index++;
                  if (index < sliceCount) return next();
                  try {
                    let total = 0; for (const ab of slices) total += (ab && ab.byteLength) ? ab.byteLength : 0;
                    const out = new Uint8Array(total); let off = 0; for (const ab of slices) { const u8 = new Uint8Array(ab); out.set(u8, off); off += u8.byteLength; }
                    const b64 = (function(buf){ let bin=''; const bytes=new Uint8Array(buf); for(let i=0;i<bytes.byteLength;i++) bin+=String.fromCharCode(bytes[i]); return btoa(bin); })(out.buffer);
                    try { file.closeAsync(); } catch {}
                    resolve(b64);
                  } catch (e) { try { file.closeAsync(); } catch {}; reject(e); }
                });
              };
              next();
            });
          } catch (e) { reject(e); }
        });
      }

      async function saveProgressWord() {
        const b64 = await exportWordDocumentAsBase64();
        await fetch(`${API_BASE}/api/v1/save-progress`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, base64: b64 }) });
      }

      async function saveProgressWebViaDownload() {
        const pick = [`${API_BASE}/documents/working/default.docx`, `${API_BASE}/documents/canonical/default.docx`];
        let chosen = null; for (const u of pick) { try { const h = await fetch(u, { method: 'HEAD' }); if (h.ok) { chosen = u; break; } } catch {} }
        if (!chosen) throw new Error('no_doc');
        const res = await fetch(chosen); if (!res.ok) throw new Error('download');
        const buf = await res.arrayBuffer();
        const b64 = (function(buf){ let bin=''; const bytes=new Uint8Array(buf); for(let i=0;i<bytes.byteLength;i++) bin+=String.fromCharCode(bytes[i]); return btoa(bin); })(buf);
        await fetch(`${API_BASE}/api/v1/save-progress`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, base64: b64 }) });
      }

      const actions = React.useMemo(() => ({
        finalize: async () => { try { await fetch(`${API_BASE}/api/v1/finalize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) }); await refresh(); } catch {} },
        unfinalize: async () => { try { await fetch(`${API_BASE}/api/v1/unfinalize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) }); await refresh(); } catch {} },
        checkout: async () => { try { await fetch(`${API_BASE}/api/v1/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) }); await refresh(); } catch {} },
        checkin: async () => { try { await fetch(`${API_BASE}/api/v1/checkin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) }); await refresh(); } catch {} },
        cancel: async () => { try { await fetch(`${API_BASE}/api/v1/checkout/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) }); await refresh(); } catch {} },
        override: async () => { try { await fetch(`${API_BASE}/api/v1/checkout/override`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) }); await refresh(); } catch {} },
        factoryReset: async () => { try { await fetch(`${API_BASE}/api/v1/factory-reset`, { method: 'POST' }); await refresh(); } catch {} },
        sendVendor: (opts) => { try { window.dispatchEvent(new CustomEvent('react:open-modal', { detail: { id: 'send-vendor', options: { userId, ...(opts||{}) } } })); } catch {} },
        saveProgress: async () => { try { if (typeof Office !== 'undefined') { await saveProgressWord(); } else { await saveProgressWebViaDownload(); } await refresh(); } catch {} },
        setUser: (nextUserId, nextRole) => { try { setUserId(nextUserId); if (nextRole) setRole(nextRole); } catch {} },
      }), [API_BASE, refresh, userId]);

      return React.createElement(StateContext.Provider, { value: { config, revision, actions, isConnected, lastTs, currentUser: userId, currentRole: role, users } }, props.children);
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

    function ConnectionBadge() {
      const { isConnected, lastTs } = React.useContext(StateContext);
      const when = lastTs ? new Date(lastTs).toLocaleTimeString() : '—';
      const style = { marginLeft: '8px', padding: '2px 6px', border: '1px solid #ddd', borderRadius: '10px', fontSize: '12px', background: isConnected ? '#e6ffed' : '#fff5f5' };
      return React.createElement('div', { style }, isConnected ? `connected • last: ${when}` : 'disconnected');
    }

    function ActionButtons() {
      const { config, actions } = React.useContext(StateContext);
      const btns = (config && config.buttons) ? config.buttons : {};
      const add = (label, onClick, show) => show ? React.createElement('button', { key: label, className: 'ms-Button', onClick: onClick, style: { margin: '4px' } }, React.createElement('span', { className: 'ms-Button-label' }, label)) : null;
      return React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } }, [
        add('Checkout', actions.checkout, !!btns.checkoutBtn),
        add('Checkin', actions.checkin, !!btns.checkinBtn),
        add('Cancel Checkout', actions.cancel, !!btns.cancelBtn),
        add('Save Progress', actions.saveProgress, !!btns.saveProgressBtn),
        add('Finalize', actions.finalize, !!btns.finalizeBtn),
        add('Unfinalize', actions.unfinalize, !!btns.unfinalizeBtn),
        add('Override Checkout', actions.override, !!btns.overrideBtn),
        add('Send to Vendor', () => actions.sendVendor({}), !!btns.sendVendorBtn),
        add('Factory Reset', actions.factoryReset, true),
      ].filter(Boolean));
    }

    function ExhibitsList() {
      const API_BASE = getApiBase();
      const [items, setItems] = React.useState([]);
      const refresh = React.useCallback(async () => { try { const r = await fetch(`${API_BASE}/api/v1/exhibits`); if (r.ok) { const j = await r.json(); setItems(Array.isArray(j.items) ? j.items : []); } } catch {} }, [API_BASE]);
      React.useEffect(() => { refresh(); }, [refresh]);
      return React.createElement('div', null,
        React.createElement('div', { style: { fontWeight: 600, marginTop: '8px' } }, 'Exhibits'),
        items.length ? React.createElement('ul', null, items.map((it, i) => React.createElement('li', { key: i }, React.createElement('a', { href: it.url, target: '_blank' }, it.name)))) : React.createElement('div', null, '(none)')
      );
    }

    function UserCard() {
      const { users, currentUser, currentRole, actions } = React.useContext(StateContext);
      const [selected, setSelected] = React.useState(currentUser);
      React.useEffect(() => { setSelected(currentUser); }, [currentUser]);
      const onChange = (e) => {
        const nextId = e.target.value;
        const u = (users || []).find(x => (x.id || x.label) === nextId) || {};
        try { actions.setUser(nextId, u.role || 'editor'); } catch {}
        setSelected(nextId);
      };
      const pill = React.createElement('span', { style: { background: '#fde68a', color: '#92400e', border: '1px solid #fbbf24', borderRadius: '999px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 } }, (currentRole || 'editor').toUpperCase());
      const select = React.createElement('select', { value: selected || '', onChange, style: { marginLeft: '8px' } }, (users || []).map((u, i) => React.createElement('option', { key: i, value: u.id || u.label }, u.label || u.id)));
      return React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [pill, select]);
    }

    function DocumentControls() {
      const API_BASE = getApiBase();
      const isWord = typeof Office !== 'undefined';
      const openNew = async () => {
        if (isWord) {
          const input = document.createElement('input'); input.type = 'file'; input.accept = '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          input.onchange = async (e) => {
            const file = e.target.files && e.target.files[0]; if (!file) return;
            const buf = await file.arrayBuffer(); const b64 = (function(buf){ let bin=''; const bytes=new Uint8Array(buf); for(let i=0;i<bytes.byteLength;i++) bin+=String.fromCharCode(bytes[i]); return btoa(bin); })(buf);
            try { await Word.run(async (context) => { context.document.body.insertFileFromBase64(b64, Word.InsertLocation.replace); await context.sync(); }); } catch {}
          };
          input.click();
        } else {
          const input = document.createElement('input'); input.type = 'file'; input.accept = '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          input.onchange = (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; try { window.dispatchEvent(new CustomEvent('superdoc:open-file', { detail: { file: f } })); } catch {} };
          input.click();
        }
      };
      const viewLatest = async () => {
        if (isWord) {
          try { const res = await fetch(`${API_BASE}/documents/canonical/default.docx`); if (!res.ok) throw new Error('download'); const buf = await res.arrayBuffer(); const b64 = (function(buf){ let bin=''; const bytes=new Uint8Array(buf); for(let i=0;i<bytes.byteLength;i++) bin+=String.fromCharCode(bytes[i]); return btoa(bin); })(buf); await Word.run(async (context) => { context.document.body.insertFileFromBase64(b64, Word.InsertLocation.replace); await context.sync(); }); } catch {}
        } else {
          try { window.dispatchEvent(new CustomEvent('superdoc:open-url', { detail: { url: `${API_BASE}/documents/canonical/default.docx` } })); } catch {}
        }
      };
      const btn = (label, onClick) => React.createElement('button', { className: 'ms-Button', onClick, style: { margin: '4px' } }, React.createElement('span', { className: 'ms-Button-label' }, label));
      return React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } }, [btn('Open New Document', openNew), btn('View Latest', viewLatest)]);
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
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } }, [
              React.createElement(UserCard, { key: 'u' }),
              React.createElement(ConnectionBadge, { key: 'c' }),
            ]),
            React.createElement(BannerStack, { key: 'b' }),
            React.createElement(ActionButtons, null),
            React.createElement(DocumentControls, null),
            React.createElement(ExhibitsList, null),
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


