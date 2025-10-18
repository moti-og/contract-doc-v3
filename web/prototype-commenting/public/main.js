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
  // Option A badges and list/detail
  document.getElementById('aBadge').textContent = s.comments.unresolved + s.messages.open;
  const aInt = document.getElementById('aFilterInternal').checked;
  const aExt = document.getElementById('aFilterExternal').checked;
  const aPriv = document.getElementById('aFilterPrivileged').checked;
  const aList = document.getElementById('aList');
  aList.innerHTML = '';
  const combined = [
    ...state.comments.map(c => ({ kind: 'comment', key: c.id, unresolved: !c.resolved, internal: c.internal, privileged: c.privileged, text: c.text, anchor: sampleAnchor(c.id) })),
    ...state.messages.map(m => ({ kind: 'message', key: m.id, unresolved: !!m.open, internal: m.internal, privileged: m.privileged, text: m.text }))
  ];
  combined
    .filter(x => (x.internal ? aInt : aExt))
    .filter(x => (aPriv ? true : !x.privileged))
    .sort((a,b) => Number(b.unresolved) - Number(a.unresolved))
    .forEach(x => aList.appendChild(renderRowA(x)));

  // Option B map + grouped list
  document.getElementById('bBadge').textContent = s.comments.unresolved;
  const bInt = document.getElementById('bFilterInternal').checked;
  const bExt = document.getElementById('bFilterExternal').checked;
  const bPriv = document.getElementById('bFilterPrivileged').checked;
  renderAnchorMap('bMap');
  const activeTab = document.querySelector('#optionB .tab--active')?.dataset.tab || 'comments';
  const bContent = document.getElementById('bContent');
  bContent.innerHTML = '';
  if (activeTab === 'comments') {
    const groups = groupByPage(state.comments
      .filter(c => (c.internal ? bInt : bExt))
      .filter(c => (bPriv ? true : !c.privileged)));
    Object.keys(groups).forEach(page => bContent.appendChild(renderGroup(page, groups[page].map(c => ({ kind: 'comment', key: c.id, unresolved: !c.resolved, internal: c.internal, privileged: c.privileged, text: c.text, anchor: sampleAnchor(c.id) })))));
  } else {
    const groups = { Inbox: state.messages.filter(m => (m.internal ? bInt : bExt)).filter(m => (bPriv ? true : !m.privileged)) };
    Object.keys(groups).forEach(k => bContent.appendChild(renderGroup(k, groups[k].map(m => ({ kind: 'message', key: m.id, unresolved: !!m.open, internal: m.internal, privileged: m.privileged, text: m.text })))));
  }

  // Option C unified feed
  const cBadge = s.comments.unresolved + s.messages.open; document.getElementById('cBadge').textContent = cBadge;
  const ch = document.getElementById('cFacetChannel').value;
  const vis = document.getElementById('cFacetVisibility').value;
  const prv = document.getElementById('cFacetPrivileged').value;
  const st = document.getElementById('cFacetState').value;
  const cFeed = document.getElementById('cFeed'); cFeed.innerHTML = '';
  combined
    .filter(x => ch === 'all' ? true : (ch === 'comments' ? x.kind === 'comment' : x.kind === 'message'))
    .filter(x => vis === 'both' ? true : (vis === 'internal' ? x.internal : !x.internal))
    .filter(x => prv === 'both' ? true : (prv === 'priv' ? x.privileged : !x.privileged))
    .filter(x => st === 'all' ? true : x.unresolved)
    .forEach(x => cFeed.appendChild(renderFeedItem(x)));
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
  // Option A filters and buttons
  ['aFilterInternal','aFilterExternal','aFilterPrivileged'].forEach(id => document.getElementById(id).onchange = render);
  document.getElementById('aAddComment').onclick = () => { state.comments.unshift({ id: `c${Date.now()}`, text: 'New comment', internal: true, privileged: false, resolved: false }); render(); };
  document.getElementById('aAddMessage').onclick = () => { state.messages.unshift({ id: `m${Date.now()}`, text: 'New message', internal: false, privileged: false, open: true }); render(); };

  // Option B filters, tabs, buttons
  ['bFilterInternal','bFilterExternal','bFilterPrivileged'].forEach(id => document.getElementById(id).onchange = render);
  document.getElementById('bTabComments').onclick = (e) => { e.target.classList.add('tab--active'); document.getElementById('bTabMessages').classList.remove('tab--active'); render(); };
  document.getElementById('bTabMessages').onclick = (e) => { e.target.classList.add('tab--active'); document.getElementById('bTabComments').classList.remove('tab--active'); render(); };
  document.getElementById('bAddComment').onclick = () => { state.comments.unshift({ id: `c${Date.now()}`, text: 'New comment', internal: true, privileged: false, resolved: false }); render(); };
  document.getElementById('bAddMessage').onclick = () => { state.messages.unshift({ id: `m${Date.now()}`, text: 'New message', internal: false, privileged: false, open: true }); render(); };

  // Option C facets and export
  ['cFacetChannel','cFacetVisibility','cFacetPrivileged','cFacetState'].forEach(id => document.getElementById(id).onchange = render);
  document.getElementById('cExport').onclick = () => {
    const includeInternal = document.getElementById('cIncludeInternal').checked;
    const includePriv = document.getElementById('cIncludePrivileged').checked;
    const s = summarize();
    alert(`Export with options:\nInclude Internal: ${includeInternal}\nInclude Privileged: ${includePriv}\nUnresolved comments: ${s.comments.unresolved}\nOpen messages: ${s.messages.open}`);
  };
}

bind();
render();

// Helpers for options
function renderRowA(x) {
  const row = document.createElement('div');
  row.className = 'item';
  const meta = document.createElement('div'); meta.className = 'item__meta';
  meta.appendChild(chip(x.kind === 'comment' ? 'Comment' : 'Message'));
  meta.appendChild(chip(x.internal ? 'Internal' : 'External', x.internal ? 'chip--internal' : ''));
  if (x.privileged) meta.appendChild(chip('Privileged','chip--priv'));
  if (!x.unresolved) meta.appendChild(chip('Resolved'));
  const text = document.createElement('div'); text.className = 'item__text'; text.textContent = x.text;
  row.append(meta, text);
  row.onclick = () => selectDetailA(x);
  return row;
}

function selectDetailA(x) {
  const pane = document.getElementById('aDetail');
  pane.innerHTML = '';
  const head = document.createElement('div'); head.className = 'item__meta';
  head.appendChild(chip(x.kind.toUpperCase()));
  if (x.anchor) head.appendChild(chip(x.anchor));
  head.appendChild(chip(x.internal ? 'Internal' : 'External', x.internal ? 'chip--internal' : ''));
  if (x.privileged) head.appendChild(chip('Privileged','chip--priv'));
  const body = document.createElement('div'); body.className = 'item__text'; body.textContent = x.text;
  const actions = document.createElement('div'); actions.className = 'item__footer';
  const toggle = document.createElement('button'); toggle.textContent = x.unresolved ? 'Resolve' : 'Reopen';
  toggle.onclick = () => {
    if (x.kind === 'comment') { const c = state.comments.find(c=>c.id===x.key); c.resolved = !c.resolved; }
    else { const m = state.messages.find(m=>m.id===x.key); m.open = !m.open; }
    render();
  };
  const flip = document.createElement('button'); flip.textContent = x.internal ? 'Make External' : 'Make Internal';
  flip.onclick = () => { if (x.kind==='comment'){ const c=state.comments.find(c=>c.id===x.key); c.internal=!c.internal; } else { const m=state.messages.find(m=>m.id===x.key); m.internal=!m.internal; } render(); };
  const priv = document.createElement('button'); priv.textContent = x.privileged ? 'Unmark Privileged' : 'Mark Privileged';
  priv.onclick = () => { if (x.kind==='comment'){ const c=state.comments.find(c=>c.id===x.key); c.privileged=!c.privileged; } else { const m=state.messages.find(m=>m.id===x.key); m.privileged=!m.privileged; } render(); };
  actions.append(toggle, flip, priv);
  pane.append(head, body, actions);
}

function renderAnchorMap(id) {
  const el = document.getElementById(id); el.innerHTML = '';
  // fake pins across the bar
  const pins = [10, 30, 45, 62, 80];
  pins.forEach(p => { const d = document.createElement('div'); d.className = 'anchor-pin'; d.style.left = p+'%'; el.appendChild(d); });
}

function groupByPage(list) {
  // deterministic fake grouping by last digit of id
  const groups = {};
  list.forEach((c) => {
    const page = 1 + (Number(String(c.id).replace(/\D/g,'')) % 5);
    groups[page] = groups[page] || [];
    groups[page].push(c);
  });
  return groups;
}

function renderGroup(label, items) {
  const wrap = document.createElement('div'); wrap.className = 'group';
  const head = document.createElement('div'); head.className = 'group__header'; head.textContent = `Page ${label} · ${items.length} item(s)`;
  wrap.appendChild(head);
  items.forEach(x => wrap.appendChild(renderRowA(x)));
  return wrap;
}

function renderFeedItem(x) { return renderRowA(x); }

function sampleAnchor(id) {
  return '§ ' + (Number(String(id).replace(/\D/g,'')) % 7 + 1);
}


