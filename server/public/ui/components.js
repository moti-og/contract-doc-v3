// Simple shared UI module rendered by both clients
// Exports mountApp({ rootSelector }) which fetches the state matrix and renders action buttons

export function mountApp({ rootSelector = '#app-root' } = {}) {
  const root = document.querySelector(rootSelector);
  if (!root) return;

  const el = (tag, attrs = {}, children = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else if (k.startsWith('on') && typeof v === 'function') n[k] = v;
      else n.setAttribute(k, v);
    }
    for (const c of children) n.append(c);
    return n;
  };

  // Determine backend origin so add-in (4000) hits the server (4001) directly
  const API_BASE = (() => {
    try {
      const src = Array.from(document.scripts).map(s => s.src).find(u => typeof u === 'string' && u.includes('/static/ui/components.js'));
      if (src) return new URL(src).origin;
    } catch {}
    try { return location.origin; } catch {}
    return 'https://localhost:4001';
  })();

  function detectPlatform() {
    const hasOffice = typeof window.Office !== 'undefined';
    return hasOffice ? 'word' : 'web';
  }

  let initialized = false;
  let statusBox;
  let buttonsRow;
  let container;
  let actionsSection;
  let exhibitsSection;
  let exhibitsList;
  let approvalsSection;
  let sse;
  let currentUser = 'user1';
  let currentRole = 'editor';
  let currentDocumentId = null;
  let connectionBadge;
  let lastEventBadge;
  let reconnectAttempt = 0;
  let userSelectEl;
  let statusChipEl;
  let userCardNameEl;
  let userRolePillEl;
  let docLinkEl;
  let chatBoxEl;
  let chatInputEl;
  let buttonsGrid;
  let themeTokens = null;
  let activeModalEl = null;

  async function renderServerModal(schema, onAction) {
    try { if (activeModalEl) { activeModalEl.remove(); activeModalEl = null; } } catch {}
    const s = schema || {};
    const theme = s.theme || {};
    const overlay = el('div', { style: { position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 } });
    const panel = el('div', { style: { width: (s.style?.width || 720) + 'px', maxWidth: '95vw', background: theme.background || '#fff', border: `1px solid ${theme.border || '#e5e7eb'}`, borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' } });
    const header = el('div', { style: { padding: '14px 16px', borderBottom: `1px solid ${theme.border || '#e5e7eb'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: theme.headerBg || '#fff', color: theme.headerFg || '#111827' } }, [
      el('div', { style: { fontWeight: '700' } }, [s.title || 'Modal']),
      (function(){ const b = el('button', { class: 'ms-Button', onclick: () => { try { overlay.remove(); activeModalEl = null; } catch {} } }, [el('span', { class: 'ms-Button-label' }, ['✕'])]); b.style.border = 'none'; b.style.background = 'transparent'; return b; })()
    ]);
    const body = el('div', { style: { padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' } });
    if (s.description) body.append(el('div', { style: { color: theme.muted || '#6b7280' } }, [s.description]));
    const values = {};
    const form = el('div', { style: { display: 'grid', gridTemplateColumns: '1fr', gap: '12px' } });
    const makeRow = (f) => {
      const row = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });
      const lab = el('label', { style: { fontSize: '12px', color: theme.muted || '#6b7280' } }, [f.label || f.name]);
      let input;
      if ((f.type || 'text') === 'textarea') {
        input = el('textarea', { rows: 4, placeholder: f.placeholder || '', maxlength: f.maxLength ? String(f.maxLength) : null, style: { padding: '8px', border: `1px solid ${theme.border || '#e5e7eb'}`, borderRadius: '6px' } });
      } else {
        input = el('input', { type: 'text', placeholder: f.placeholder || '', value: f.value || '', style: { padding: '8px', border: `1px solid ${theme.border || '#e5e7eb'}`, borderRadius: '6px' } });
      }
      if (typeof f.value === 'string') input.value = f.value;
      values[f.name] = input.value || '';
      input.oninput = () => { values[f.name] = input.value || ''; };
      row.append(lab, input);
      return row;
    };
    (Array.isArray(s.fields) ? s.fields : []).forEach(f => form.append(makeRow(f)));
    body.append(form);
    const footer = el('div', { style: { padding: '12px 16px', borderTop: `1px solid ${theme.border || '#e5e7eb'}`, display: 'flex', justifyContent: 'flex-end', gap: '8px' } });
    const actions = Array.isArray(s.actions) ? s.actions : [];
    actions.forEach(a => {
      const btn = el('button', { class: 'ms-Button', onclick: async () => {
        try {
          if (typeof onAction === 'function') await onAction(values, a.id);
        } finally {
          if (a.id !== 'save') { try { overlay.remove(); activeModalEl = null; } catch {} }
          else { try { overlay.remove(); activeModalEl = null; } catch {} }
        }
      } }, [el('span', { class: 'ms-Button-label' }, [a.label || a.id])]);
      if (a.variant === 'primary') {
        btn.style.background = theme.primary || '#111827';
        btn.style.color = '#ffffff';
        btn.style.border = `1px solid ${theme.primary || '#111827'}`;
      }
      footer.append(btn);
    });
    panel.append(header, body, footer);
    overlay.append(panel);
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) { try { overlay.remove(); activeModalEl = null; } catch {} } });
    document.body.appendChild(overlay);
    activeModalEl = overlay;
  }
  
  function getModeForRole(role) {
    const r = (role || '').toLowerCase();
    if (r === 'viewer') return 'viewing';
    // Map suggestor and vendor to suggesting
    if (r === 'suggestor' || r === 'vendor') return 'suggesting';
    return 'editing';
  }

  function setEditorModeForRole(role) {
    const mode = getModeForRole(role);
    if (detectPlatform() === 'web') {
      try { window.dispatchEvent(new CustomEvent('superdoc:set-mode', { detail: { mode } })); } catch {}
    } else if (isWord()) {
      try {
        Word.run(async (context) => {
          if (mode === 'suggesting') {
            try { Office.context.ui.displayDialogAsync && console.log('Suggesting mode requested'); } catch {}
          }
          await context.sync();
        });
      } catch {}
    }
  }

  const log = (m) => {
    if (!statusBox) return;
    const ts = new Date().toLocaleTimeString();
    statusBox.textContent += `[${ts}] ${m}\n`;
    statusBox.scrollTop = statusBox.scrollHeight;
  };

  function isWord() {
    try {
      if (typeof Office === 'undefined') return false;
      const host = Office?.context?.host || Office?.HostType?.Word;
      if (typeof host === 'string') return host.toLowerCase() === 'word';
      return true;
    } catch {
      return false;
    }
  }

  function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  async function openWordDocumentFromBase64(base64) {
    if (!isWord()) return;
    await Word.run(async (context) => {
      context.document.body.insertFileFromBase64(base64, Word.InsertLocation.replace);
      await context.sync();
    });
  }

  async function openWordDocumentFromUrl(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('download');
      const buf = await res.arrayBuffer();
      const b64 = arrayBufferToBase64(buf);
      await openWordDocumentFromBase64(b64);
      log('Opened document in Word');
    } catch (e) {
      log(`open URL ERR ${e?.message || e}`);
    }
  }

  async function fetchMatrix() {
    const params = new URLSearchParams({ platform: detectPlatform(), userId: currentUser });
    const res = await fetch(`${API_BASE}/api/v1/state-matrix?${params.toString()}`);
    if (!res.ok) throw new Error('matrix');
    return res.json();
  }

  async function ensureTheme() {
    if (themeTokens) return themeTokens;
    try {
      const r = await fetch(`${API_BASE}/api/v1/theme`);
      if (r.ok) themeTokens = await r.json();
    } catch {}
    return themeTokens;
  }

  async function doPost(url) {
    const r = await fetch(url, { method: 'POST' });
    if (!r.ok) throw new Error(url);
  }

  function ensureDom() {
    if (initialized) return;
    container = el('div', { id: 'ui-container', style: { display: 'flex', flexDirection: 'column', gap: '12px' } });

    const header = el('div', { style: { padding: detectPlatform()==='word' ? '4px 0' : '8px 0', fontWeight: '600', display: 'flex', gap: detectPlatform()==='word' ? '4px' : '8px', alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #eee' } }, [
      `Shared UI — Platform: ${detectPlatform()}`,
    ]);
    connectionBadge = el('span', { id: 'conn-badge', style: { marginLeft: '8px', padding: '2px 6px', border: '1px solid #ddd', borderRadius: '10px', fontSize: '12px', background: '#fafafa' } }, ['disconnected']);
    lastEventBadge = el('span', { id: 'last-event-badge', style: { marginLeft: '8px', padding: '2px 6px', border: '1px solid #ddd', borderRadius: '10px', fontSize: '12px', background: '#fafafa' } }, ['last: —']);
    const userSel = el('select', { onchange: async (e) => { 
      currentUser = e.target.value; 
      try {
        const opt = e.target.selectedOptions?.[0];
        const r = opt?.getAttribute('data-role');
        if (r) { currentRole = r; if (userRolePillEl) userRolePillEl.textContent = r.toUpperCase(); }
      } catch {}
      log(`user set to ${currentUser}`);
      try { await fetch(`${API_BASE}/api/v1/events/client`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'userChange', payload: { userId: currentUser }, userId: currentUser, platform: detectPlatform() }) }); } catch {}
      updateUI();
    } });
    userSelectEl = userSel;
    header.append(connectionBadge, lastEventBadge);

    // User row: role badge + user dropdown
    userRolePillEl = el('span', { style: { background: '#fde68a', color: '#92400e', border: '1px solid #fbbf24', borderRadius: '999px', padding: '2px 8px', fontSize: '11px', fontWeight: '700' } }, [currentRole.toUpperCase()]);
    const userRow = el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', width: '100%' } }, [
      userRolePillEl,
      userSel,
    ]);
    header.append(userRow);

    const docRow = el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center' } });
    docLinkEl = el('a', { href: `${API_BASE}/documents/default.docx`, target: '_blank', style: { color: '#2563eb', fontWeight: '600', textDecoration: 'none' } }, ['current.docx']);
    docRow.append(docLinkEl);
    const chipRow = el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center' } });
    statusChipEl = el('div', { style: { marginTop: '6px', background: '#e0edff', color: '#1e40af', border: '1px solid #c7dbff', borderRadius: '6px', padding: '8px 12px', fontWeight: '600', width: '90%', textAlign: 'center' } }, ['Available for check-out']);
    chipRow.append(statusChipEl);

    const section = (title) => el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid #eee', borderRadius: '6px', padding: '8px 10px', background: '#fff' } }, [
      el('div', { style: { fontWeight: '600' } }, [title]),
    ]);

    const card = section('');
    card.firstChild.remove();
    const cardInner = el('div', { style: { background: '#fff7db', border: '1px solid #f5e3a3', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' } });
    buttonsGrid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '8px' } });
    cardInner.append(buttonsGrid);
    card.append(cardInner);

    exhibitsSection = section('Exhibits');
    const exHeader = el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } });
    const refreshBtn = el('button', { class: 'ms-Button', onclick: () => updateExhibits() }, [el('span', { class: 'ms-Button-label' }, ['Refresh'])]);
    const fileInput = el('input', { type: 'file', onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const fd = new FormData();
      fd.append('file', file);
      try {
        await fetch(`${API_BASE}/api/v1/exhibits/upload`, { method: 'POST', body: fd });
        log(`exhibit upload OK ${file.name}`);
        await updateExhibits();
      } catch (err) {
        log(`exhibit upload ERR ${err?.message || err}`);
      } finally {
        e.target.value = '';
      }
    } });
    exHeader.append(refreshBtn, fileInput);
    exhibitsList = el('ul', { style: { margin: 0, paddingLeft: '16px' } });
    exhibitsSection.append(exHeader, exhibitsList);

    approvalsSection = section('Approvals (stub)');
    approvalsSection.append(el('div', {}, ['No approvers configured.']));

    const assistantSection = section('Assistant');
    chatBoxEl = el('div', { style: { border: '1px solid #ddd', borderRadius: '6px', padding: '8px', height: '120px', overflow: 'auto', background: '#fff' } }, ["Hi, I'm OG Assist. How can I help you?"]);
    const chatRow = el('div', { style: { display: 'flex', gap: '8px' } });
    chatInputEl = el('input', { type: 'text', placeholder: 'Type a message...', style: { flex: '1', padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px' } });
    const chatSend = el('button', { class: 'ms-Button', onclick: async () => { const t = chatInputEl.value.trim(); if (!t) return; chatBoxEl.append(el('div', { style: { marginTop: '6px' } }, [t])); chatInputEl.value=''; try { await fetch(`${API_BASE}/api/v1/events/client`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'chat', payload: { text: t }, userId: currentUser, platform: detectPlatform() }) }); } catch {} } }, [el('span', { class: 'ms-Button-label' }, ['Send'])]);
    chatRow.append(chatInputEl, chatSend);
    assistantSection.append(chatBoxEl, chatRow);

    // Notifications controls (copy)
    const notifControls = el('div', { style: { display: 'flex', justifyContent: 'flex-end' } }, [
      (function(){
        const btn = el('button', { class: 'ms-Button', onclick: async () => {
          try {
            const text = statusBox?.textContent || '';
            if (navigator?.clipboard?.writeText) {
              await navigator.clipboard.writeText(text);
            } else {
              const ta = document.createElement('textarea');
              ta.value = text; document.body.appendChild(ta); ta.select();
              try { document.execCommand('copy'); } catch {}
              document.body.removeChild(ta);
            }
            log('copied notifications to clipboard');
          } catch (e) {
            log(`copy failed ${e?.message || e}`);
          }
        } }, [el('span', { class: 'ms-Button-label' }, ['Copy'])]);
        return btn;
      })()
    ]);
    statusBox = el('div', { style: { fontFamily: 'Consolas, monospace', whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', maxHeight: '160px', overflow: 'auto' } });

    container.append(header, docRow, chipRow, card, notifControls, statusBox, assistantSection, exhibitsSection, approvalsSection);
    root.append(container);
    initialized = true;
    connectSSE();
  }

  function setConnected(isConnected) {
    if (!connectionBadge) return;
    connectionBadge.textContent = isConnected ? 'connected' : 'disconnected';
    connectionBadge.style.background = isConnected ? '#e6ffed' : '#fff5f5';
    connectionBadge.style.borderColor = isConnected ? '#a6f3b5' : '#f3c2c2';
  }

  function setLastEvent(ts) {
    if (!lastEventBadge) return;
    const when = ts ? new Date(ts).toLocaleTimeString() : '—';
    lastEventBadge.textContent = `last: ${when}`;
  }

  function connectSSE() {
    try {
      if (sse) { try { sse.close(); } catch {} }
      sse = new EventSource(`${API_BASE}/api/v1/events`);
      sse.onopen = () => {
        setConnected(true);
        reconnectAttempt = 0;
        log('SSE open');
      };
      sse.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data);
          setLastEvent(payload?.ts || Date.now());
          if (payload?.documentId && currentDocumentId && payload.documentId !== currentDocumentId) {
            log(`SSE ignored (doc mismatch: ${payload.documentId} != ${currentDocumentId})`);
            return;
          }
          log(`SSE ${ev.data}`);
          if (payload?.type === 'finalize' || payload?.type === 'documentUpload' || payload?.type === 'documentRevert' || payload?.type === 'checkout' || payload?.type === 'checkin' || payload?.type === 'overrideCheckout' || payload?.type === 'checkoutCancel') {
            updateUI();
          }
          if (payload?.type === 'exhibitUpload') {
            updateExhibits();
          }
        } catch {
          log(`SSE parse ERR`);
        }
      };
      sse.onerror = () => {
        setConnected(false);
        try { sse.close(); } catch {}
        const base = 1000;
        const delay = Math.min(30000, base * Math.pow(2, reconnectAttempt)) + Math.floor(Math.random() * 250);
        reconnectAttempt = Math.min(reconnectAttempt + 1, 6);
        log(`SSE reconnecting in ${delay}ms`);
        setTimeout(connectSSE, delay);
      };
    } catch {
      setConnected(false);
      const delay = 2000 + Math.floor(Math.random() * 500);
      setTimeout(connectSSE, delay);
    }
  }

  function setButtons(config) {
    if (buttonsGrid) buttonsGrid.innerHTML = '';
    if (buttonsRow) buttonsRow.innerHTML = '';
    const add = (label, onclick, show = true) => {
      if (!show) return;
      const btn = el('button', { class: 'ms-Button', onclick }, [el('span', { class: 'ms-Button-label' }, [label])]);
      if (buttonsGrid) buttonsGrid.append(btn); else buttonsRow.append(btn);
    };
    // Doc open
    if (isWord()) {
      const filePick = el('input', { type: 'file', accept: '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document', style: { display: 'none' } });
      add('Open New Document', () => filePick.click(), true);
      add('View Latest', () => openWordDocumentFromUrl(`${API_BASE}/documents/canonical/default.docx`), true);
      filePick.onchange = async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const buf = await f.arrayBuffer(); const b64 = arrayBufferToBase64(buf); await openWordDocumentFromBase64(b64); log(`Opened ${f.name}`); } catch (err) { log(`open file ERR ${err?.message || err}`); } finally { e.target.value = ''; } };
      if (buttonsGrid) buttonsGrid.append(filePick); else buttonsRow.append(filePick);
    } else {
      const filePick = el('input', { type: 'file', accept: '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document', style: { display: 'none' } });
      add('Open New Document', () => filePick.click(), true);
      add('View Latest', () => window.dispatchEvent(new CustomEvent('superdoc:open-url', { detail: { url: `${API_BASE}/documents/canonical/default.docx` } })), true);
      filePick.onchange = async (e) => { const f = e.target.files?.[0]; if (!f) return; try { window.dispatchEvent(new CustomEvent('superdoc:open-file', { detail: { file: f } })); log(`Opened ${f.name} in web`); } catch (err) { log(`open file ERR ${err?.message || err}`); } finally { e.target.value = ''; } };
      if (buttonsGrid) buttonsGrid.append(filePick); else buttonsRow.append(filePick);
    }
    add('Finalize', async () => { try { await fetch(`${API_BASE}/api/v1/finalize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser }) }); log('finalize OK'); await updateUI(); } catch(e){ log(`finalize ERR ${e.message}`);} }, !!config.buttons.finalizeBtn);
    add('Unfinalize', async () => { try { await fetch(`${API_BASE}/api/v1/unfinalize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser }) }); log('unfinalize OK'); await updateUI(); } catch(e){ log(`unfinalize ERR ${e.message}`);} }, !!config.buttons.unfinalizeBtn);
    add('Checkout', async () => { try { await fetch(`${API_BASE}/api/v1/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser }) }); log('checkout OK'); await updateUI(); } catch(e){ log(`checkout ERR ${e.message}`);} }, !!config.buttons.checkoutBtn);
    add('Override Checkout', async () => { try { await fetch(`${API_BASE}/api/v1/checkout/override`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser }) }); log('override OK'); await updateUI(); } catch(e){ log(`override ERR ${e.message}`);} }, !!config.buttons.overrideBtn);
    add('Checkin', async () => { try { await fetch(`${API_BASE}/api/v1/checkin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser }) }); log('checkin OK'); await updateUI(); } catch(e){ log(`checkin ERR ${e.message}`);} }, !!config.buttons.checkinBtn);
    add('Cancel Checkout', async () => { try { await fetch(`${API_BASE}/api/v1/checkout/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser }) }); log('cancel OK'); await updateUI(); } catch(e){ log(`cancel ERR ${e.message}`);} }, !!config.buttons.cancelBtn);
    // Send to Vendor (modal)
    add('Send to Vendor', async () => {
      try {
        const schemaRes = await fetch(`${API_BASE}/api/v1/ui/modal/send-vendor?userId=${encodeURIComponent(currentUser)}`);
        if (!schemaRes.ok) throw new Error('schema');
        const { schema } = await schemaRes.json();
        await renderServerModal(schema, async (values, actionId) => {
          if (actionId !== 'save') return;
          const body = { ...values, userId: currentUser };
          const r = await fetch(`${API_BASE}/api/v1/send-vendor`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          if (!r.ok) throw new Error('send-vendor');
          log(`sendVendor OK to ${values.vendorName}`);
        });
      } catch (e) { log(`sendVendor ERR ${e?.message || e}`); }
    }, !!config.buttons.sendVendorBtn);
    // Factory Reset: wipe working overlays and reset state
    add('Factory Reset', async () => { 
      try { 
        const r = await fetch(`${API_BASE}/api/v1/factory-reset`, { method: 'POST' }); 
        if (!r.ok) throw new Error('factory-reset'); 
        log('factory reset OK'); 
        await updateUI(); 
      } catch(e){ log(`factory reset ERR ${e.message}`);} 
    }, true);
  }

  async function updateUI() {
    try {
      const { config } = await fetchMatrix();
      if (config?.documentId) {
        currentDocumentId = config.documentId;
        const badgeId = 'doc-id-badge';
        let badge = document.getElementById(badgeId);
        if (!badge) {
          badge = el('span', { id: badgeId, style: { marginLeft: '8px', padding: '2px 6px', border: '1px solid #ddd', borderRadius: '10px', fontSize: '12px', background: '#fafafa' } });
          root.firstChild?.append(badge);
        }
        badge.textContent = `doc: ${currentDocumentId}`;
      }
      // Right-pane banner from server
      if (statusChipEl) {
        const b = (config && config.banner) ? config.banner : {};
        statusChipEl.textContent = b.title && b.message ? `${b.title}: ${b.message}` : (b.title || statusChipEl.textContent);
        const theme = await ensureTheme();
        try {
          const t = theme?.banner?.[b.state];
          if (t) {
            statusChipEl.style.background = t.pillBg || statusChipEl.style.background;
            statusChipEl.style.color = t.pillFg || statusChipEl.style.color;
            statusChipEl.style.borderColor = t.pillBg || statusChipEl.style.borderColor;
          }
        } catch {}
      }
      if (userCardNameEl) userCardNameEl.textContent = currentUser;
      if (userRolePillEl) userRolePillEl.textContent = (currentRole || 'editor').toUpperCase();
      setEditorModeForRole(currentRole);
      setButtons(config);
    } catch (e) {
      log(`matrix ERR ${e?.message || e}`);
    }
  }

  async function updateExhibits() {
    try {
      const res = await fetch(`${API_BASE}/api/v1/exhibits`);
      if (!res.ok) throw new Error('exhibits');
      const j = await res.json();
      exhibitsList.innerHTML = '';
      const items = Array.isArray(j.items) ? j.items : [];
      for (const it of items) {
        const li = el('li');
        const a = el('a', { href: it.url, target: '_blank' }, [it.name]);
        li.append(a);
        exhibitsList.append(li);
      }
      if (items.length === 0) { exhibitsList.append(el('li', {}, ['(none)'])); }
    } catch (err) {
      log(`exhibits ERR ${err?.message || err}`);
    }
  }

  ensureDom();
  (async () => {
    try {
      const r = await fetch(`${API_BASE}/api/v1/users`);
      const j = await r.json();
      const items = Array.isArray(j.items) ? j.items : [];
      if (userSelectEl) {
        userSelectEl.innerHTML = '';
        let found = false;
        for (const u of items) {
          const id = u.id || u.label;
          const label = u.label || id;
          const selected = id === currentUser ? 'selected' : null;
          if (selected) found = true;
          userSelectEl.append(el('option', { value: id, selected, 'data-role': u.role || 'editor' }, [label]));
        }
        if (!found && items.length) {
          currentUser = items[0].id || items[0].label;
          userSelectEl.value = currentUser;
          currentRole = items[0].role || 'editor';
        }
        // Always sync current user and role to the selected option on first load
        try {
          const opt = userSelectEl.selectedOptions?.[0];
          if (opt) {
            currentUser = opt.value || currentUser;
            const rsel = opt.getAttribute('data-role');
            if (rsel) {
              currentRole = rsel;
              if (userRolePillEl) userRolePillEl.textContent = rsel.toUpperCase();
            }
          }
        } catch {}
      }
    } catch {}
    updateUI();
  })();
  updateExhibits();
}


