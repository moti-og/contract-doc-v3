const state = {
  comments: [
    { id: 'c1', text: 'Clarify payment terms in 3.2', internal: true, privileged: false, resolved: false },
    { id: 'c2', text: 'Remove outdated clause', internal: false, privileged: false, resolved: true },
    { id: 'c3', text: 'Attorney notes re: indemnity', internal: true, privileged: true, resolved: false }
  ],
  messages: [
    { id: 'm1', text: 'Vendor follow-up on dates', internal: false, privileged: false, open: true },
    { id: 'm2', text: 'Counsel thread (privileged)', internal: true, privileged: true, open: true },
    { id: 'm3', text: 'Resolved Q&A', internal: false, privileged: false, open: false }
  ]
};

function summarize() {
  const commentsTotal = state.comments.length;
  const commentsUnresolved = state.comments.filter(c => !c.resolved).length;
  const commentsInternalUnresolved = state.comments.filter(c => c.internal && !c.resolved).length;
  const commentsExternalUnresolved = state.comments.filter(c => !c.internal && !c.resolved).length;
  const commentsPrivileged = state.comments.filter(c => c.privileged).length;

  const messagesTotal = state.messages.length;
  const messagesOpen = state.messages.filter(m => m.open).length;
  const messagesInternalOpen = state.messages.filter(m => m.internal && m.open).length;
  const messagesExternalOpen = state.messages.filter(m => !m.internal && m.open).length;
  const messagesPrivileged = state.messages.filter(m => m.privileged).length;

  return {
    comments: { total: commentsTotal, unresolved: commentsUnresolved, internalUnresolved: commentsInternalUnresolved, externalUnresolved: commentsExternalUnresolved, privileged: commentsPrivileged },
    messages: { total: messagesTotal, open: messagesOpen, internalOpen: messagesInternalOpen, externalOpen: messagesExternalOpen, privileged: messagesPrivileged }
  };
}

function render() {
  const s = summarize();
  document.getElementById('commentsBadge').textContent = s.comments.unresolved;
  document.getElementById('messagesBadge').textContent = s.messages.open;

  // Comments list
  const showInt = document.getElementById('commentsFilterInternal').checked;
  const showExt = document.getElementById('commentsFilterExternal').checked;
  const showPriv = document.getElementById('commentsFilterPrivileged').checked;
  const commentsList = document.getElementById('commentsList');
  commentsList.innerHTML = '';
  state.comments
    .filter(c => (c.internal ? showInt : showExt))
    .filter(c => (showPriv ? true : !c.privileged))
    .forEach(c => commentsList.appendChild(renderComment(c)));

  // Messages list
  const mShowInt = document.getElementById('messagesFilterInternal').checked;
  const mShowExt = document.getElementById('messagesFilterExternal').checked;
  const mShowPriv = document.getElementById('messagesFilterPrivileged').checked;
  const messagesList = document.getElementById('messagesList');
  messagesList.innerHTML = '';
  state.messages
    .filter(m => (m.internal ? mShowInt : mShowExt))
    .filter(m => (mShowPriv ? true : !m.privileged))
    .forEach(m => messagesList.appendChild(renderMessage(m)));

  // Summary cards
  const cards = document.getElementById('summaryCards');
  cards.innerHTML = '';
  cards.appendChild(card('Comments — Unresolved', s.comments.unresolved));
  cards.appendChild(card('Comments — Privileged', s.comments.privileged));
  cards.appendChild(card('Messages — Open', s.messages.open));
  cards.appendChild(card('Messages — Privileged', s.messages.privileged));
}

function chip(text, cls) {
  const span = document.createElement('span');
  span.className = `chip ${cls || ''}`;
  span.textContent = text;
  return span;
}

function renderComment(c) {
  const el = document.createElement('div');
  el.className = 'item';
  const meta = document.createElement('div');
  meta.className = 'item__meta';
  meta.appendChild(chip(c.internal ? 'Internal' : 'External', c.internal ? 'chip--internal' : ''));
  if (c.privileged) meta.appendChild(chip('Privileged', 'chip--priv'));
  if (c.resolved) meta.appendChild(chip('Resolved'));
  const text = document.createElement('div');
  text.className = 'item__text';
  text.textContent = c.text;
  const footer = document.createElement('div');
  footer.className = 'item__footer';
  const toggle = document.createElement('button'); toggle.textContent = c.resolved ? 'Reopen' : 'Resolve';
  toggle.onclick = () => { c.resolved = !c.resolved; render(); };
  const flagPriv = document.createElement('button'); flagPriv.textContent = c.privileged ? 'Unmark Privileged' : 'Mark Privileged';
  flagPriv.onclick = () => { c.privileged = !c.privileged; render(); };
  const flipVis = document.createElement('button'); flipVis.textContent = c.internal ? 'Make External' : 'Make Internal';
  flipVis.onclick = () => { c.internal = !c.internal; render(); };
  footer.append(toggle, flagPriv, flipVis);
  el.append(meta, text, footer);
  return el;
}

function renderMessage(m) {
  const el = document.createElement('div');
  el.className = 'item';
  const meta = document.createElement('div');
  meta.className = 'item__meta';
  meta.appendChild(chip(m.internal ? 'Internal' : 'External', m.internal ? 'chip--internal' : ''));
  if (m.privileged) meta.appendChild(chip('Privileged', 'chip--priv'));
  if (!m.open) meta.appendChild(chip('Closed'));
  const text = document.createElement('div'); text.className = 'item__text'; text.textContent = m.text;
  const footer = document.createElement('div'); footer.className = 'item__footer';
  const close = document.createElement('button'); close.textContent = m.open ? 'Close' : 'Reopen';
  close.onclick = () => { m.open = !m.open; render(); };
  const flipVis = document.createElement('button'); flipVis.textContent = m.internal ? 'Make External' : 'Make Internal';
  flipVis.onclick = () => { m.internal = !m.internal; render(); };
  const flagPriv = document.createElement('button'); flagPriv.textContent = m.privileged ? 'Unmark Privileged' : 'Mark Privileged';
  flagPriv.onclick = () => { m.privileged = !m.privileged; render(); };
  footer.append(close, flipVis, flagPriv);
  el.append(meta, text, footer);
  return el;
}

function card(label, value) {
  const el = document.createElement('div');
  el.className = 'card';
  const h = document.createElement('div'); h.style.fontSize = '12px'; h.style.color = '#6b7280'; h.textContent = label;
  const v = document.createElement('div'); v.style.fontSize = '22px'; v.style.fontWeight = '700'; v.textContent = value;
  el.append(h, v);
  return el;
}

function bind() {
  document.getElementById('commentsFilterInternal').onchange = render;
  document.getElementById('commentsFilterExternal').onchange = render;
  document.getElementById('commentsFilterPrivileged').onchange = render;
  document.getElementById('messagesFilterInternal').onchange = render;
  document.getElementById('messagesFilterExternal').onchange = render;
  document.getElementById('messagesFilterPrivileged').onchange = render;

  document.getElementById('addCommentBtn').onclick = () => {
    state.comments.unshift({ id: `c${Date.now()}`, text: 'New comment', internal: true, privileged: false, resolved: false });
    render();
  };
  document.getElementById('addMessageBtn').onclick = () => {
    state.messages.unshift({ id: `m${Date.now()}`, text: 'New message thread', internal: false, privileged: false, open: true });
    render();
  };
  document.getElementById('simulateExportBtn').onclick = () => {
    const includeInternal = document.getElementById('optIncludeInternal').checked;
    const includePriv = document.getElementById('optIncludePrivileged').checked;
    const s = summarize();
    alert(`Export with options:\nInclude Internal: ${includeInternal}\nInclude Privileged: ${includePriv}\nCurrent unresolved comments: ${s.comments.unresolved}\nOpen messages: ${s.messages.open}`);
  };
}

bind();
render();


