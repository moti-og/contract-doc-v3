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
  let roleSelectEl;
  let actionsSelectEl;
  let statusChipEl;
  let userCardNameEl;
  let userRolePillEl;
  let docLinkEl;
  let chatBoxEl;
  let chatInputEl;
  let buttonsGrid;
  
  function getModeForRole(role) {
    const r = (role || '').toLowerCase();
    if (r === 'viewer') return 'viewing';
    if (r === 'suggestor' || r === 'vendor') return 'suggesting';
    return 'editing';
  }

  function setEditorModeForRole(role) {
    const mode = getModeForRole(role);
    if (detectPlatform() === 'web') {
      try { window.dispatchEvent(new CustomEvent('superdoc:set-mode', { detail: { mode } })); } catch {}
    } else if (isWord()) {
      // Best-effort: try to hint mode in Word; APIs vary by requirement set, so guard everything
      try {
        Word.run(async (context) => {
          // Suggesting: attempt to enable track changes via built-in command
          if (mode === 'suggesting') {
            try { Office.context.ui.displayDialogAsync && console.log('Suggesting mode requested'); } catch {}
          }
          // Viewing: we could protect the doc; leave as a no-op prototype for now
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
      // Fallback: if Office exists in taskpane, assume Word host
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
      // Replace current document contents with the provided DOCX
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
    const params = new URLSearchParams({ userRole: currentRole, platform: detectPlatform(), userId: currentUser });
    const res = await fetch(`/api/v1/state-matrix?${params.toString()}`);
    if (!res.ok) throw new Error('matrix');
    return res.json();
  }

  async function doPost(url) {
    const r = await fetch(url, { method: 'POST' });
    if (!r.ok) throw new Error(url);
  }

  function ensureDom() {
    if (initialized) return;
    // Layout container (right-side pane)
    container = el('div', { id: 'ui-container', style: { display: 'flex', flexDirection: 'column', gap: '12px' } });

    const header = el('div', { style: { padding: '8px 0', fontWeight: '600', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #eee' } }, [
      `Shared UI — Platform: ${detectPlatform()}`,
    ]);
    // Connection + last event badges
    connectionBadge = el('span', { id: 'conn-badge', style: { marginLeft: '8px', padding: '2px 6px', border: '1px solid #ddd', borderRadius: '10px', fontSize: '12px', background: '#fafafa' } }, ['disconnected']);
    lastEventBadge = el('span', { id: 'last-event-badge', style: { marginLeft: '8px', padding: '2px 6px', border: '1px solid #ddd', borderRadius: '10px', fontSize: '12px', background: '#fafafa' } }, ['last: —']);
    const userSel = el('select', { onchange: async (e) => { 
      currentUser = e.target.value; 
      // When user changes, default the role to the user's configured role if present
      try {
        const opt = e.target.selectedOptions?.[0];
        const r = opt?.getAttribute('data-role');
        if (r) { currentRole = r; roleSel.value = r; }
      } catch {}
      log(`user set to ${currentUser}`);
      try { await fetch('/api/v1/events/client', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'userChange', payload: { userId: currentUser }, userId: currentUser, role: currentRole, platform: detectPlatform() }) }); } catch {}
      updateUI();
    } });
    userSelectEl = userSel;
    const roleSel = el('select', { onchange: async (e) => { currentRole = e.target.value; log(`role set to ${currentRole}`); try { await fetch('/api/v1/events/client', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'roleChange', payload: { role: currentRole }, userId: currentUser, role: currentRole, platform: detectPlatform() }) }); } catch {} updateUI(); } }, []);
    roleSelectEl = roleSel;
    header.append(connectionBadge, lastEventBadge, el('span', {}, ['User: ']), userSel, el('span', {}, ['Role: ']), roleSel);

    // Document link and status chip
    const docRow = el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center' } });
    docLinkEl = el('a', { href: '/documents/default.docx', target: '_blank', style: { color: '#2563eb', fontWeight: '600', textDecoration: 'none' } }, ['current.docx']);
    docRow.append(docLinkEl);
    const chipRow = el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center' } });
    statusChipEl = el('div', { style: { marginTop: '6px', background: '#e0edff', color: '#1e40af', border: '1px solid #c7dbff', borderRadius: '6px', padding: '8px 12px', fontWeight: '600', width: '90%', textAlign: 'center' } }, ['Available for check-out']);
    chipRow.append(statusChipEl);

    // Section helper
    const section = (title) => el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid #eee', borderRadius: '6px', padding: '8px 10px', background: '#fff' } }, [
      el('div', { style: { fontWeight: '600' } }, [title]),
    ]);

    // User card (name + role pill + simple badges)
    const card = section('');
    card.firstChild.remove();
    const cardInner = el('div', { style: { background: '#fff7db', border: '1px solid #f5e3a3', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' } });
    const cardTop = el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } });
    cardTop.append(el('div', { style: { color: '#6b7280', fontSize: '12px' } }, ['User: ']));
    userCardNameEl = el('div', { style: { fontWeight: '600' } }, [currentUser]);
    userRolePillEl = el('span', { style: { marginLeft: '8px', background: '#fde68a', color: '#92400e', border: '1px solid #fbbf24', borderRadius: '999px', padding: '2px 6px', fontSize: '11px', fontWeight: '700' } }, [currentRole.toUpperCase()]);
    cardTop.append(userCardNameEl, userRolePillEl);
    const switchRow = el('div', {}, [
      el('div', { style: { fontSize: '12px', color: '#6b7280', marginBottom: '4px' } }, ['Switch user:']),
      userSel,
    ]);
    // Buttons grid container (2 columns on narrow panes)
    buttonsGrid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '8px' } });
    cardInner.append(cardTop, switchRow, buttonsGrid);
    card.append(cardInner);
    // We no longer render the old Actions section with a dropdown; buttonsGrid is used instead

    exhibitsSection = section('Exhibits');
    const exHeader = el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } });
    const refreshBtn = el('button', { class: 'ms-Button', onclick: () => updateExhibits() }, [el('span', { class: 'ms-Button-label' }, ['Refresh'])]);
    const fileInput = el('input', { type: 'file', onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const fd = new FormData();
      fd.append('file', file);
      try {
        await fetch('/api/v1/exhibits/upload', { method: 'POST', body: fd });
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

    // Assistant chat section
    const assistantSection = section('Assistant');
    chatBoxEl = el('div', { style: { border: '1px solid #ddd', borderRadius: '6px', padding: '8px', height: '120px', overflow: 'auto', background: '#fff' } }, ["Hi, I'm OG Assist. How can I help you?"]);
    const chatRow = el('div', { style: { display: 'flex', gap: '8px' } });
    chatInputEl = el('input', { type: 'text', placeholder: 'Type a message...', style: { flex: '1', padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px' } });
    const chatSend = el('button', { class: 'ms-Button', onclick: async () => { const t = chatInputEl.value.trim(); if (!t) return; chatBoxEl.append(el('div', { style: { marginTop: '6px' } }, [t])); chatInputEl.value=''; try { await fetch('/api/v1/events/client', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'chat', payload: { text: t }, userId: currentUser, role: currentRole, platform: detectPlatform() }) }); } catch {} } }, [el('span', { class: 'ms-Button-label' }, ['Send'])]);
    chatRow.append(chatInputEl, chatSend);
    assistantSection.append(chatBoxEl, chatRow);

    statusBox = el('div', { style: { fontFamily: 'Consolas, monospace', whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', maxHeight: '160px', overflow: 'auto' } });

    container.append(header, docRow, chipRow, card, actionsSection, exhibitsSection, approvalsSection, assistantSection, statusBox);
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
      sse = new EventSource('/api/v1/events');
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
          if (payload?.type === 'finalize' || payload?.type === 'documentUpload' || payload?.type === 'documentRevert' || payload?.type === 'checkout' || payload?.type === 'checkin') {
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
      add('View Latest', () => openWordDocumentFromUrl('/documents/canonical/default.docx'), true);
      filePick.onchange = async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const buf = await f.arrayBuffer(); const b64 = arrayBufferToBase64(buf); await openWordDocumentFromBase64(b64); log(`Opened ${f.name}`); } catch (err) { log(`open file ERR ${err?.message || err}`); } finally { e.target.value = ''; } };
      if (buttonsGrid) buttonsGrid.append(filePick); else buttonsRow.append(filePick);
    } else {
      const filePick = el('input', { type: 'file', accept: '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document', style: { display: 'none' } });
      add('Open New Document', () => filePick.click(), true);
      add('View Latest', () => window.dispatchEvent(new CustomEvent('superdoc:open-url', { detail: { url: '/documents/canonical/default.docx' } })), true);
      filePick.onchange = async (e) => { const f = e.target.files?.[0]; if (!f) return; try { window.dispatchEvent(new CustomEvent('superdoc:open-file', { detail: { file: f } })); log(`Opened ${f.name} in web`); } catch (err) { log(`open file ERR ${err?.message || err}`); } finally { e.target.value = ''; } };
      if (buttonsGrid) buttonsGrid.append(filePick); else buttonsRow.append(filePick);
    }
    add('Finalize', async () => { try { await fetch('/api/v1/finalize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser }) }); log('finalize OK'); await updateUI(); } catch(e){ log(`finalize ERR ${e.message}`);} }, !!config.buttons.finalizeBtn);
    add('Unfinalize', async () => { try { await fetch('/api/v1/unfinalize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser }) }); log('unfinalize OK'); await updateUI(); } catch(e){ log(`unfinalize ERR ${e.message}`);} }, !!config.buttons.unfinalizeBtn);
    add('Checkout', async () => { try { await fetch('/api/v1/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser }) }); log('checkout OK'); await updateUI(); } catch(e){ log(`checkout ERR ${e.message}`);} }, !!config.buttons.checkoutBtn);
    add('Checkin', async () => { try { await fetch('/api/v1/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser }) }); log('checkin OK'); await updateUI(); } catch(e){ log(`checkin ERR ${e.message}`);} }, !!config.buttons.checkinBtn);
    add('Revert to Canonical', async () => { try { await doPost('/api/v1/document/revert'); log('revert OK'); } catch(e){ log(`revert ERR ${e.message}`);} }, true);
    add('Snapshot', async () => { try { const r = await fetch('/api/v1/document/snapshot', { method: 'POST' }); if (!r.ok) throw new Error('snapshot'); const j = await r.json(); log(`snapshot OK ${j.path || ''}`); } catch(e){ log(`snapshot ERR ${e.message}`);} }, true);
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
      // Update status chip and user card
      if (statusChipEl) {
        const cs = config.checkoutStatus || { isCheckedOut: false };
        if (!cs.isCheckedOut) {
          statusChipEl.textContent = 'Available for check-out';
          statusChipEl.style.background = '#e0edff';
          statusChipEl.style.color = '#1e40af';
          statusChipEl.style.borderColor = '#c7dbff';
        } else {
          statusChipEl.textContent = `Checked out by ${cs.checkedOutUserId}`;
          statusChipEl.style.background = '#fff7ed';
          statusChipEl.style.color = '#9a3412';
          statusChipEl.style.borderColor = '#fed7aa';
        }
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
      const res = await fetch('/api/v1/exhibits');
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
  // Populate users dynamically
  (async () => {
    try {
      const r = await fetch('/api/v1/users');
      const j = await r.json();
      const items = Array.isArray(j.items) ? j.items : [];
      const rolesObj = j.roles || {};
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
        }
      }
      if (roleSelectEl) {
        roleSelectEl.innerHTML = '';
        const roleKeys = Object.keys(rolesObj);
        const addRole = (rk) => roleSelectEl.append(el('option', { value: rk, selected: rk === currentRole ? 'selected' : null }, [rk]));
        if (roleKeys.length) {
          for (const rk of roleKeys) addRole(rk);
          // default role to user's configured role if present
          try {
            const opt = userSelectEl?.selectedOptions?.[0];
            const rCfg = opt?.getAttribute('data-role');
            if (rCfg && roleKeys.includes(rCfg)) { currentRole = rCfg; roleSelectEl.value = rCfg; }
          } catch {}
        } else {
          for (const rk of ['editor','vendor','viewer']) addRole(rk);
          if (!currentRole) { currentRole = 'editor'; roleSelectEl.value = 'editor'; }
        }
      }
    } catch {}
    updateUI();
  })();
  updateExhibits();
}


