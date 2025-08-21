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
  let sse;
  let currentUser = 'user1';
  let currentRole = 'editor';
  let currentDocumentId = null;

  const log = (m) => {
    if (!statusBox) return;
    const ts = new Date().toLocaleTimeString();
    statusBox.textContent += `[${ts}] ${m}\n`;
    statusBox.scrollTop = statusBox.scrollHeight;
  };

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
    const header = el('div', { style: { padding: '8px 0', fontWeight: '600', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } }, [
      `Shared UI — Platform: ${detectPlatform()}`,
    ]);
    const userSel = el('select', { onchange: (e) => { currentUser = e.target.value; log(`user set to ${currentUser}`); updateUI(); } }, [
      el('option', { value: 'user1', selected: 'selected' }, ['user1']),
      el('option', { value: 'user2' }, ['user2']),
      el('option', { value: 'user3' }, ['user3']),
    ]);
    const roleSel = el('select', { onchange: (e) => { currentRole = e.target.value; log(`role set to ${currentRole}`); updateUI(); } }, [
      el('option', { value: 'editor', selected: 'selected' }, ['editor']),
      el('option', { value: 'vendor' }, ['vendor']),
      el('option', { value: 'viewer' }, ['viewer']),
    ]);
    header.append(el('span', {}, ['User: ']), userSel, el('span', {}, ['Role: ']), roleSel);
    buttonsRow = el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' } });
    statusBox = el('div', { style: { fontFamily: 'Consolas, monospace', whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', maxHeight: '160px', overflow: 'auto', marginTop: '8px' } });
    root.append(header, buttonsRow, statusBox);
    initialized = true;

    // Connect SSE once
    try {
      sse = new EventSource('/api/v1/events');
      sse.onmessage = (ev) => {
        // Ignore events for other documents
        try {
          const payload = JSON.parse(ev.data);
          if (payload?.documentId && currentDocumentId && payload.documentId !== currentDocumentId) {
            log(`SSE ignored (doc mismatch: ${payload.documentId} != ${currentDocumentId})`);
            return;
          }
          log(`SSE ${ev.data}`);
          if (payload?.type === 'finalize' || payload?.type === 'documentUpload' || payload?.type === 'documentRevert' || payload?.type === 'checkout' || payload?.type === 'checkin') {
            updateUI();
          }
        } catch {
          log(`SSE parse ERR`);
        }
      };
    } catch {}
  }

  function setButtons(config) {
    buttonsRow.innerHTML = '';
    const addBtn = (label, onClick, visible = true) => {
      if (!visible) return;
      buttonsRow.append(el('button', { class: 'ms-Button', onclick: onClick }, [el('span', { class: 'ms-Button-label' }, [label]) ]));
    };
    addBtn('Finalize', async () => { try { await doPost('/api/v1/finalize'); log('finalize OK'); await updateUI(); } catch(e){ log(`finalize ERR ${e.message}`);} }, !!config.buttons.finalizeBtn);
    addBtn('Unfinalize', async () => { try { await doPost('/api/v1/unfinalize'); log('unfinalize OK'); await updateUI(); } catch(e){ log(`unfinalize ERR ${e.message}`);} }, !!config.buttons.unfinalizeBtn);
    addBtn('Checkout', async () => { try { await fetch('/api/v1/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser }) }); log('checkout OK'); await updateUI(); } catch(e){ log(`checkout ERR ${e.message}`);} }, !!config.buttons.checkoutBtn);
    addBtn('Checkin', async () => { try { await fetch('/api/v1/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser }) }); log('checkin OK'); await updateUI(); } catch(e){ log(`checkin ERR ${e.message}`);} }, !!config.buttons.checkinBtn);
    addBtn('Revert to Canonical', async () => { try { await doPost('/api/v1/document/revert'); log('revert OK'); } catch(e){ log(`revert ERR ${e.message}`);} }, true);
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

  ensureDom();
  updateUI();
}


