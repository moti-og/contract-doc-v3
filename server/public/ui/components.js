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
    const userSel = el('select', { onchange: async (e) => { currentUser = e.target.value; log(`user set to ${currentUser}`); try { await fetch('/api/v1/events/client', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'userChange', payload: { userId: currentUser }, userId: currentUser, role: currentRole, platform: detectPlatform() }) }); } catch {} updateUI(); } });
    const roleSel = el('select', { onchange: async (e) => { currentRole = e.target.value; log(`role set to ${currentRole}`); try { await fetch('/api/v1/events/client', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'roleChange', payload: { role: currentRole }, userId: currentUser, role: currentRole, platform: detectPlatform() }) }); } catch {} updateUI(); } }, [
      el('option', { value: 'editor', selected: 'selected' }, ['editor']),
      el('option', { value: 'vendor' }, ['vendor']),
      el('option', { value: 'viewer' }, ['viewer']),
    ]);
    header.append(connectionBadge, lastEventBadge, el('span', {}, ['User: ']), userSel, el('span', {}, ['Role: ']), roleSel);

    // Section helper
    const section = (title) => el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid #eee', borderRadius: '6px', padding: '8px 10px', background: '#fff' } }, [
      el('div', { style: { fontWeight: '600' } }, [title]),
    ]);

    actionsSection = section('Actions');
    buttonsRow = el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } });
    actionsSection.append(buttonsRow);

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

    statusBox = el('div', { style: { fontFamily: 'Consolas, monospace', whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', maxHeight: '160px', overflow: 'auto' } });

    container.append(header, actionsSection, exhibitsSection, approvalsSection, statusBox);
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
    buttonsRow.innerHTML = '';
    // Word-only document actions should always be present
    if (isWord()) {
      const viewLatestBtn = el('button', { class: 'ms-Button', onclick: () => openWordDocumentFromUrl('/documents/canonical/default.docx') }, [el('span', { class: 'ms-Button-label' }, ['View Latest'])]);
      const filePick = el('input', { type: 'file', accept: '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document', style: { display: 'none' } });
      const openNewBtn = el('button', { class: 'ms-Button', onclick: () => filePick.click() }, [el('span', { class: 'ms-Button-label' }, ['Open New Document'])]);
      filePick.onchange = async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        try {
          const buf = await f.arrayBuffer();
          const b64 = arrayBufferToBase64(buf);
          await openWordDocumentFromBase64(b64);
          log(`Opened ${f.name}`);
        } catch (err) {
          log(`open file ERR ${err?.message || err}`);
        } finally {
          e.target.value = '';
        }
      };
      buttonsRow.append(viewLatestBtn, openNewBtn, filePick);
    } else {
      // Web: ask host page to swap SuperDoc document
      const viewLatestBtn = el('button', { class: 'ms-Button', onclick: () => window.dispatchEvent(new CustomEvent('superdoc:open-url', { detail: { url: '/documents/canonical/default.docx' } })) }, [el('span', { class: 'ms-Button-label' }, ['View Latest'])]);
      const filePick = el('input', { type: 'file', accept: '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document', style: { display: 'none' } });
      const openNewBtn = el('button', { class: 'ms-Button', onclick: () => filePick.click() }, [el('span', { class: 'ms-Button-label' }, ['Open New Document'])]);
      filePick.onchange = async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        try {
          window.dispatchEvent(new CustomEvent('superdoc:open-file', { detail: { file: f } }));
          log(`Opened ${f.name} in web`);
        } catch (err) {
          log(`open file ERR ${err?.message || err}`);
        } finally {
          e.target.value = '';
        }
      };
      buttonsRow.append(viewLatestBtn, openNewBtn, filePick);
    }
    const addBtn = (label, onClick, visible = true) => {
      if (!visible) return;
      buttonsRow.append(el('button', { class: 'ms-Button', onclick: onClick }, [el('span', { class: 'ms-Button-label' }, [label]) ]));
    };
    addBtn('Finalize', async () => { try { await fetch('/api/v1/finalize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser }) }); log('finalize OK'); await updateUI(); } catch(e){ log(`finalize ERR ${e.message}`);} }, !!config.buttons.finalizeBtn);
    addBtn('Unfinalize', async () => { try { await fetch('/api/v1/unfinalize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser }) }); log('unfinalize OK'); await updateUI(); } catch(e){ log(`unfinalize ERR ${e.message}`);} }, !!config.buttons.unfinalizeBtn);
    addBtn('Checkout', async () => { try { await fetch('/api/v1/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser }) }); log('checkout OK'); await updateUI(); } catch(e){ log(`checkout ERR ${e.message}`);} }, !!config.buttons.checkoutBtn);
    addBtn('Checkin', async () => { try { await fetch('/api/v1/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser }) }); log('checkin OK'); await updateUI(); } catch(e){ log(`checkin ERR ${e.message}`);} }, !!config.buttons.checkinBtn);
    addBtn('Revert to Canonical', async () => { try { await doPost('/api/v1/document/revert'); log('revert OK'); } catch(e){ log(`revert ERR ${e.message}`);} }, true);
    addBtn('Snapshot', async () => { try { const r = await fetch('/api/v1/document/snapshot', { method: 'POST' }); if (!r.ok) throw new Error('snapshot'); const j = await r.json(); log(`snapshot OK ${j.path || ''}`); } catch(e){ log(`snapshot ERR ${e.message}`);} }, true);
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
      const items = Array.isArray(j.items) ? j.items : ['user1','user2','user3'];
      userSel.innerHTML = '';
      for (const u of items) {
        userSel.append(el('option', { value: u, selected: u === currentUser ? 'selected' : null }, [u]));
      }
    } catch {}
    updateUI();
  })();
  updateExhibits();
}


