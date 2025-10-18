// React entry (UMD) for shared UI. Safe to include even if React is missing.
// Exposes window.mountReactApp({ rootSelector }) for progressive migration.

(function (global) {
  const win = typeof global !== 'undefined' ? global : (typeof window !== 'undefined' ? window : this);

  function getApiBase() {
    // Always use the API server port (4001), not the dev server port (4000)
    // The dev server (4000) is for serving the add-in HTML/JS
    // The API server (4001) is for all backend API calls
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

    // Web-only: eliminate page-level scrollbar; let document and sidebar own scrolling
    try {
      if (typeof Office === 'undefined') {
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
        document.body.style.height = '100vh';
        // Lock any scrollable ancestors of the app root to avoid a second right-side scrollbar
        (function lockScrollableAncestors() {
          try {
            const root = rootEl;
            if (!root) return;
            let node = root.parentElement;
            const changed = [];
            while (node && node !== document.body && node !== document.documentElement) {
              const cs = getComputedStyle(node);
              const isScrollable = /(auto|scroll)/.test(cs.overflowY) || node.scrollHeight > node.clientHeight;
              if (isScrollable) {
                node.setAttribute('data-og-prev-overflow-y', node.style.overflowY || '');
                node.style.overflowY = 'hidden';
                changed.push(node);
              }
              node = node.parentElement;
            }
            window.addEventListener('unload', () => {
              try { changed.forEach(n => { const prev = n.getAttribute('data-og-prev-overflow-y') || ''; n.style.overflowY = prev; n.removeAttribute('data-og-prev-overflow-y'); }); } catch {}
            });
          } catch {}
        })();
      }
    } catch {}

    // Load confetti.js library
    const confettiScript = document.createElement('script');
    confettiScript.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js';
     confettiScript.onload = () => {};
    document.head.appendChild(confettiScript);

    const React = win.React;
    const ReactDOM = win.ReactDOM;
    const MIN_DOCX_SIZE = 8192; // bytes; reject tiny/invalid working overlays

    const ThemeContext = React.createContext({ tokens: null });
  const StateContext = React.createContext(null);

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

    // Reusable button with pressed and loading states
    function UIButton(props) {
      const { label, onClick, variant = 'primary', disabled = false, isLoading = false, uniform = false, style = {} } = props || {};
      const [pressed, setPressed] = React.useState(false);
      const [loading, setLoading] = React.useState(false);
      const busy = !!isLoading || loading;
      const className = `btn btn--${variant}${uniform ? ' btn-uniform' : ''}`;
      // Standardize spacing: no external margins; parents control spacing via gap
      const visual = Object.assign({ margin: '0', opacity: disabled ? 0.6 : 1 }, style);
      const handleClick = async (e) => {
        if (disabled || busy) return;
        try {
          const ret = onClick?.(e);
          if (ret && typeof ret.then === 'function') {
            setLoading(true);
            try { await ret; } finally { setLoading(false); }
          }
        } catch {}
      };
      const text = busy ? (typeof props.loadingLabel === 'string' ? props.loadingLabel : `${label}…`) : label;
      return React.createElement('button', { className, onClick: handleClick, disabled: disabled || busy, style: visual }, React.createElement('span', null, text));
    }

    function StateProvider(props) {
      const [config, setConfig] = React.useState(null);
      const [revision, setRevision] = React.useState(0);
      const [loadedVersion, setLoadedVersion] = React.useState(1);
      const [dismissedVersion, setDismissedVersion] = React.useState(0);
      const [viewingVersion, setViewingVersion] = React.useState(1);
      
      // Debug: Track when viewingVersion changes
      React.useEffect(() => {
        console.log(`[DEBUG] viewingVersion changed to: ${viewingVersion}`);
      }, [viewingVersion]);
      const [isConnected, setIsConnected] = React.useState(false);
      const [lastTs, setLastTs] = React.useState(0);
      // Default user: Warren Peace (user1) for web, Kent Ucky (user2) for Word add-in
      const isWordAddin = typeof Office !== 'undefined' && Office.context && Office.context.host;
      const [userId, setUserId] = React.useState(isWordAddin ? 'user2' : 'user1');
      const [role, setRole] = React.useState('editor');
      const [users, setUsers] = React.useState([]);
      const [logs, setLogs] = React.useState([]);
      const [activities, setActivities] = React.useState([]);
      const [lastSeenActivityId, setLastSeenActivityId] = React.useState(
        typeof localStorage !== 'undefined' ? localStorage.getItem('lastSeenActivityId') || null : null
      );
      const [lastSeenLogCount, setLastSeenLogCount] = React.useState(0);
      const [documentSource, setDocumentSource] = React.useState(null);
      const [lastError, setLastError] = React.useState(null);
      const [approvalsSummary, setApprovalsSummary] = React.useState(null);
      const [approvalsRevision, setApprovalsRevision] = React.useState(0);
      const [messagingCount, setMessagingCount] = React.useState(0);
      const API_BASE = getApiBase();

      // Removed excessive logging

      // Web-only: prevent page/body from adding a third scrollbar; keep scrolling scoped to document area and sidebar
      React.useEffect(() => {
        if (typeof Office !== 'undefined') return; // Word add-in unaffected
        try {
          const prevHtml = document.documentElement.style.overflow;
          const prevBody = document.body.style.overflow;
          document.documentElement.style.overflow = 'hidden';
          document.body.style.overflow = 'hidden';
          return () => {
            document.documentElement.style.overflow = prevHtml;
            document.body.style.overflow = prevBody;
          };
        } catch {}
      }, []);

      // Sync current user state to window.userStateBridge for SuperDoc
      React.useEffect(() => {
        try {
          if (typeof window !== 'undefined' && window.userStateBridge) {
            window.userStateBridge.userId = userId;
            window.userStateBridge.role = role;
            const user = users.find(u => u.id === userId || u.label === userId);
            if (user) {
              window.userStateBridge.displayName = user.label || userId;
              window.userStateBridge.email = user.email || '';
            }
          }
        } catch {}
      }, [userId, role, users]);

      // Notification formatting system
      const NOTIFICATION_TYPES = {
        success: { icon: '✅', color: '#10b981', bgColor: '#d1fae5', borderColor: '#34d399' },
        error: { icon: '❌', color: '#ef4444', bgColor: '#fee2e2', borderColor: '#f87171' },
        warning: { icon: '⚠️', color: '#f59e0b', bgColor: '#fef3c7', borderColor: '#fbbf24' },
        info: { icon: 'ℹ️', color: '#3b82f6', bgColor: '#dbeafe', borderColor: '#60a5fa' },
        system: { icon: '🔧', color: '#6b7280', bgColor: '#f9fafb', borderColor: '#d1d5db' },
        user: { icon: '👤', color: '#8b5cf6', bgColor: '#ede9fe', borderColor: '#a78bfa' },
        document: { icon: '📄', color: '#059669', bgColor: '#d1fae5', borderColor: '#34d399' },
        network: { icon: '🌐', color: '#0891b2', bgColor: '#cffafe', borderColor: '#06b6d4' }
      };

      const formatNotification = React.useCallback((message, type = 'info') => {
        const ts = new Date().toLocaleTimeString();
        const notificationType = NOTIFICATION_TYPES[type] || NOTIFICATION_TYPES.info;

        return {
          id: Date.now() + Math.random(),
          timestamp: ts,
          message: typeof message === 'string' ? message : String(message),
          type: type,
          formatted: true,
          style: notificationType
        };
      }, []);

      const addLog = React.useCallback((m, type = 'info') => {
        try {
          if (typeof m === 'string' && !m.includes('[Formatted]')) {
            // Legacy plain text message - wrap in formatted structure
            const formatted = formatNotification(m, type);
            setLogs((prev) => prev.concat(formatted));
          } else if (typeof m === 'object' && m.formatted) {
            // Already formatted notification object
            setLogs((prev) => prev.concat(m));
          } else {
            // Plain text fallback
          const ts = new Date().toLocaleTimeString();
          setLogs((prev) => prev.concat(`[${ts}] ${m}`));
          }
        } catch {}
      }, [formatNotification]);

      const markNotificationsSeen = React.useCallback(() => {
        try { setLastSeenLogCount((logs || []).length); } catch {}
      }, [logs]);

      // Load activities from server
      const loadActivities = React.useCallback(async () => {
        try {
          const response = await fetch(`${API_BASE}/api/v1/activity`);
          if (response.ok) {
            const data = await response.json();
            setActivities(data.activities || []);
          }
        } catch (e) {
          console.error('Failed to load activities:', e);
        }
      }, [API_BASE]);

      // Mark activities as seen
      const markActivitiesSeen = React.useCallback(() => {
        try {
          const latestId = activities.length > 0 ? activities[activities.length - 1]?.id : null;
          setLastSeenActivityId(latestId);
          if (typeof localStorage !== 'undefined' && latestId) {
            localStorage.setItem('lastSeenActivityId', latestId);
          }
        } catch (e) {
          console.error('Failed to mark activities seen:', e);
        }
      }, [activities]);

      // Render formatted notification
      const renderNotification = React.useCallback((log, index) => {
        // Standardized activity format: "<user> did <action> at <date/time> (vN)" plus context
        const toStd = (obj) => {
          try {
            const ts = obj.ts ? new Date(obj.ts).toLocaleString() : new Date().toLocaleString();
            const version = Number(obj.documentVersion || obj.payload?.documentVersion || 0);
            const vStr = version > 0 ? ` (v${version})` : '';
            const who = (function(){
              try {
                if (obj.userId === 'bot') return 'Assistant';
                const id = String(obj.userId || '');
                if (!id) return 'Unknown';
                // Try resolving from loaded users list if available on window
                try {
                  const list = (window.__ogUsers || []);
                  const match = Array.isArray(list) ? list.find(u => (u && (u.id === id || u.label === id))) : null;
                  if (match) return match.label || match.id || id;
                } catch {}
                if (id === 'user1') return 'Warren Peace';
                if (id === 'user2') return 'Fun E Guy';
                return id;
              } catch { return 'Unknown'; }
            })();
            const action = (function(){
              const t = String(obj.type || '').replace(/:/g, ' ');
              if (!t) return 'did something';
              return t;
            })();
            return { stdText: `${who} did ${action} at ${ts}${vStr}`, ts };
          } catch { return null; }
        };
        if (typeof log === 'string') {
          return React.createElement('div', { key: index, className: 'notification-item notification-legacy' }, log);
        } else if (log.formatted) {
          // Formatted notification object
          const { message, timestamp, type, style } = log;
          const dynamicStyle = {
            border: `1px solid ${style.borderColor}`,
            backgroundColor: style.bgColor,
            color: style.color
          };
          return React.createElement('div', { key: log.id || index, className: 'notification-item notification-formatted', style: dynamicStyle }, [
            React.createElement('span', { key: 'icon', className: 'notification-icon' }, style.icon),
            React.createElement('div', { key: 'content', className: 'notification-content' }, [
              React.createElement('div', { key: 'message', className: 'notification-message' }, message),
              React.createElement('div', { key: 'timestamp', className: 'notification-timestamp' }, timestamp)
            ])
          ]);
        } else if (log && typeof log === 'object' && log.message && log.timestamp) {
          // New activity format (card style)
          const timestamp = new Date(log.timestamp).toLocaleString();
          const userLabel = log.user?.label || 'Unknown User';
          const action = log.action || 'performed action';
          const type = String(log.type || '').split(':')[0];
          const icon = (function(){
            switch (type) {
              case 'document': return '📄';
              case 'system': return '🔧';
              case 'workflow': return '✅';
              case 'version': return '🕘';
              case 'status': return '🏷️';
              default: return 'ℹ️';
            }
          })();

          const message = log.message;

          return React.createElement('div', { key: log.id || index, className: 'activity-card' }, [
            React.createElement('div', { key: 'row', className: 'activity-card__row' }, [
              React.createElement('span', { key: 'icon', className: 'activity-card__icon' }, icon),
              React.createElement('div', { key: 'body', className: 'activity-card__body' }, [
                React.createElement('div', { key: 'title', className: 'activity-card__title' }, message),
                React.createElement('div', { key: 'meta', className: 'activity-card__meta' }, `${userLabel} • ${timestamp}`)
              ])
            ])
          ]);
        } else if (log && typeof log === 'object' && (log.type || log.userId || log.ts)) {
          const std = toStd(log);
          if (std) return React.createElement('div', { key: index, className: 'notification-item notification-legacy' }, std.stdText);
        }
        return null;
      }, []);

      // Prefer working default if present, else canonical. Append a revision hint.
      const choosePreferredDocUrl = React.useCallback(async (revHint) => {
        try {
          const working = `${API_BASE}/documents/working/default.docx`;
          const canonical = `${API_BASE}/documents/canonical/default.docx`;
          let url = canonical;
          try {
            const h = await fetch(working, { method: 'HEAD' });
            if (h.ok) {
              const len = Number(h.headers.get('content-length') || '0');
              if (Number.isFinite(len) && len > MIN_DOCX_SIZE) url = working;
            }
          } catch {}
          const rev = (typeof revHint === 'number' && revHint > 0) ? revHint : Date.now();
          return `${url}?rev=${rev}`;
        } catch (e) {
            addLog(`Failed to load document: ${e?.message||e}`, 'error');
          return `${API_BASE}/documents/canonical/default.docx?rev=${Date.now()}`;
        }
      }, [API_BASE, addLog]);

      const refresh = React.useCallback(async () => {
        const plat = (typeof Office !== 'undefined') ? 'word' : 'web';
        const qs = `platform=${encodeURIComponent(plat)}&userId=${encodeURIComponent(userId)}&clientVersion=${encodeURIComponent(loadedVersion||0)}`;
        try {
          const r = await fetch(`${API_BASE}/api/v1/state-matrix?${qs}`);
            if (r.ok) {
              const j = await r.json();
              setConfig(j.config || null);
              if (typeof j.revision === 'number') setRevision(j.revision);
              try { const sum = j?.config?.approvals?.summary || null; setApprovalsSummary(sum); } catch {}
            }
        } catch {}
      }, [API_BASE, userId, loadedVersion]);

      // Refresh state-matrix when revision changes to show banners for new versions
      React.useEffect(() => {
        if (revision > 0) { // Only refresh after initial load
          refresh();
        }
      }, [revision]); // Remove refresh from deps to avoid loops

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
              // Update user state bridge for SuperDoc
              try {
                if (typeof window !== 'undefined' && window.userStateBridge) {
                  window.userStateBridge.users = items;
                }
              } catch {}
            }
          } catch {}
        })();
        refresh();
        let sse;
        try {
          sse = new EventSource(`${API_BASE}/api/v1/events`);
          window.eventSource = sse; // Expose for other components (VariablesPanel, etc.)
          sse.onopen = () => { setIsConnected(true); addLog('Connected to server', 'network'); };
          sse.onmessage = (ev) => {
            try {
              const p = JSON.parse(ev.data);
              if (p && p.ts) setLastTs(p.ts);
              const nextRev = (typeof p.revision === 'number') ? p.revision : null;
              if (nextRev !== null) setRevision(nextRev);
              if (p && p.type === 'approvals:update') {
                if (typeof p.revision === 'number') setApprovalsRevision(p.revision);
                if (p.summary) setApprovalsSummary(p.summary);
                // Only log approvals updates that have user-relevant notices
                if (p.notice) {
                  const noticeType = p.notice.type;
                  if (noticeType === 'reset') {
                    addLog('Approvals have been reset', 'warning');
                  } else if (noticeType === 'request_review') {
                    addLog('Review requested for approvals', 'info');
                  }
                }
              }
              // Handle approval completion celebration
              if (p && p.type === 'approval:complete') {
                try {
                  window.dispatchEvent(new CustomEvent('approval:complete', { detail: p }));
                } catch {}
              }
              // Handle status changes (for banner drop celebration)
              if (p && p.type === 'status') {
                try {
                  window.dispatchEvent(new CustomEvent('status:change', { detail: p }));
                  console.log('📡 Status changed to:', p.status);
                } catch {}
              }
              // Handle variable events (both singular and plural)
              if (p && p.type && (p.type.startsWith('variable:') || p.type.startsWith('variables:'))) {
                try {
                  window.dispatchEvent(new CustomEvent(p.type, { detail: p }));
                  console.log('📡 Dispatched window event:', p.type, p);
                } catch {}
              }
              // Only log user-relevant events as notifications
              if (p && p.type) {
                switch (p.type) {
                  case 'documentUpload':
                    addLog(`Document "${p.name}" uploaded successfully`, 'document');
                    break;
                  case 'documentRevert':
                    addLog('Document reverted to previous version', 'warning');
                    break;
                  case 'snapshot':
                    addLog(`Snapshot "${p.name}" created`, 'success');
                    break;
                  case 'factoryReset':
                    addLog('System factory reset completed', 'warning');
                    break;
                  case 'exhibitUpload':
                    addLog(`Exhibit "${p.name}" uploaded`, 'document');
                    break;
                  case 'compile':
                    addLog(`Document compiled as "${p.name}"`, 'success');
                    break;
                  case 'checkout':
                    addLog('Document checked out', 'info');
                    break;
                  case 'checkin':
                    addLog('Document checked in', 'success');
                    break;
                  case 'checkoutCancel':
                    addLog('Checkout cancelled', 'warning');
                    break;
                  case 'overrideCheckout':
                    addLog('Checkout override performed', 'warning');
                    break;
                  // Skip logging: hello, saveProgress, chat events, sendVendor, and plain approvals:update
                }
              }
              // IMPORTANT: do not auto-refresh documentSource on SSE. User must click View Latest or reload.
              // Exception: after a Factory Reset, reload the canonical default document so the UI returns to baseline.
              if (p && p.type === 'factoryReset') {
                try {
                  const canonical = `${API_BASE}/documents/canonical/default.docx?rev=${Date.now()}`;
                  if (typeof Office !== 'undefined') {
                    (async () => {
                      try {
                        const res = await fetch(canonical, { cache: 'no-store' });
                        if (res && res.ok) {
                          const buf = await res.arrayBuffer();
                          const b64 = (function(buf){ let bin=''; const bytes=new Uint8Array(buf); for(let i=0;i<bytes.byteLength;i++) bin+=String.fromCharCode(bytes[i]); return btoa(bin); })(buf);
                          await Word.run(async (context) => { context.document.body.insertFileFromBase64(b64, Word.InsertLocation.replace); await context.sync(); });
                          // Update loadedVersion after factory reset so banner logic works
                          try {
                            const plat = 'word';
                            const u = `${API_BASE}/api/v1/state-matrix?platform=${plat}&clientVersion=0&userId=${encodeURIComponent(String(userId||'user1'))}`;
                            const r = await fetch(u);
                            const j = await r.json();
                            const v = Number(j?.config?.documentVersion || 0);
                            if (v > 0) { 
                              console.log(`[DEBUG] Setting viewingVersion to ${v} - Source: factoryReset (add-in)`);
                              setLoadedVersion(v); 
                              setViewingVersion(v); 
                            }
                          } catch {}
                        }
                      } catch {}
                    })();
                  } else {
                    setDocumentSource(canonical);
                    // Update loadedVersion after factory reset so banner logic works
                    (async () => {
                      try {
                        const plat = 'web';
                        const u = `${API_BASE}/api/v1/state-matrix?platform=${plat}&clientVersion=0&userId=${encodeURIComponent(String(userId||'user1'))}`;
                        const r = await fetch(u);
                        const j = await r.json();
                        const v = Number(j?.config?.documentVersion || 0);
                        if (v > 0) { 
                          console.log(`[DEBUG] Setting viewingVersion to ${v} - Source: factoryReset (web)`);
                          setLoadedVersion(v); 
                          setViewingVersion(v); 
                        }
                      } catch {}
                    })();
                  }
                } catch {}
                try { window.dispatchEvent(new CustomEvent('factoryReset', { detail: p })); } catch {}
              }
              if (p && p.type === 'versions:update') { try { window.dispatchEvent(new CustomEvent('versions:update', { detail: p })); } catch {} }
              if (p && p.type === 'version:view') { try { window.dispatchEvent(new CustomEvent('version:view', { detail: p })); } catch {} }
              if (p && p.type === 'document:navigate') {
                try {
                  console.log('[SSE] document:navigate ←', p && p.payload ? { textLen: String(p.payload.text||'').length, changeType: p.payload.changeType, hasCtx: !!(p.payload.contextBefore||p.payload.contextAfter) } : {});
                  window.dispatchEvent(new CustomEvent('document:navigate', { detail: (p && p.payload) ? p.payload : {} }));
                } catch {}
              }
              // Fan out chat messages to ChatConsole
              if (p && p.type === 'chat') {
                try { window.dispatchEvent(new CustomEvent('chat:message', { detail: p })); } catch {}
              }
              if (p && p.type === 'chat:delta') {
                try { window.dispatchEvent(new CustomEvent('chat:delta', { detail: p })); } catch {}
              }
              if (p && p.type === 'chat:complete') {
                try { window.dispatchEvent(new CustomEvent('chat:complete', { detail: p })); } catch {}
              }
              if (p && p.type === 'chat:reset') {
                try { window.dispatchEvent(new CustomEvent('chat:reset', { detail: p })); } catch {}
              }
              // Fan out lightweight user messaging events
              if (p && p.type === 'approvals:message') {
                try { window.dispatchEvent(new CustomEvent('messaging:message', { detail: p })); } catch {}
              }
              // Bridge messaging reset to React app
              if (p && p.type === 'messaging:reset') {
                try { window.dispatchEvent(new CustomEvent('messaging:reset', { detail: p })); } catch {}
              }
              // Handle activity updates
              if (p && p.type === 'activity:new' && p.activity) {
                setActivities(prev => [...prev, p.activity]);
              }
              // Handle activity reset
              if (p && p.type === 'activity:reset') {
                setActivities([]);
                setLastSeenActivityId(null);
                if (typeof localStorage !== 'undefined') {
                  localStorage.removeItem('lastSeenActivityId');
                }
              }
              // Do not auto-refresh document on save/revert; show banner via state-matrix
              refresh();
            } catch {}
          };
          sse.onerror = () => { setIsConnected(false); addLog('Lost connection to server', 'error'); };
        } catch {}

        // Load initial activities
        loadActivities();

        return () => { try { sse && sse.close(); } catch {} };
      }, [API_BASE, refresh, addLog, loadActivities]);

      const addError = React.useCallback((err) => {
        try { setLastError(err || null); if (err && err.message) addLog(`Error: ${err.message}`, 'error'); } catch {}
      }, [addLog]);

      // Do not auto-sync viewingVersion to server documentVersion; viewing changes only on local actions

      // Compute initial document source on web (prefer working overlay)
      React.useEffect(() => {
        if (typeof Office !== 'undefined') return; // Word path handles separately
        (async () => {
          try {
            const src = await choosePreferredDocUrl(Date.now());
            setDocumentSource(src);
            addLog(`Document source updated`, 'document');
            // Initialize version from first matrix load
            try {
              const r = await fetch(`${API_BASE}/api/v1/state-matrix?platform=web&userId=${encodeURIComponent(userId)}`);
              if (r.ok) {
                const j = await r.json();
                const v = Number(j?.config?.documentVersion || 1);
                const ver = Number.isFinite(v) && v > 0 ? v : 1;
                setLoadedVersion(ver);
                
                try { setViewingVersion(ver); } catch {}
                try { window.dispatchEvent(new CustomEvent('version:view', { detail: { version: ver, payload: { threadPlatform: 'web' } } })); } catch {}
              }
            } catch {}
          } catch (e) { addError({ kind: 'doc_init', message: 'Failed to choose initial document', cause: String(e) }); }
        })();
      }, [API_BASE, addLog, addError, choosePreferredDocUrl]);

      // Do NOT auto-update document on revision changes. The banner/CTA controls refresh.

      // Refresh the document ONLY when the user changes (explicit action)
      const didInitUserRef = React.useRef(false);
      React.useEffect(() => {
        // Skip on initial mount; we already set initial document (web) or leave as-is (Word)
        if (!didInitUserRef.current) { didInitUserRef.current = true; return; }
        (async () => {
          try {
            const w = `${API_BASE}/documents/working/default.docx`;
            const c = `${API_BASE}/documents/canonical/default.docx`;
            let url = c;
            try {
              const h = await fetch(w, { method: 'HEAD' });
              if (h.ok) {
                const len = Number(h.headers.get('content-length') || '0');
                if (Number.isFinite(len) && len > MIN_DOCX_SIZE) url = w;
              }
            } catch {}
            const withRev = `${url}?rev=${Date.now()}`;
            if (typeof Office !== 'undefined') {
              const res = await fetch(withRev, { cache: 'no-store' }); if (!res.ok) throw new Error('download');
              const buf = await res.arrayBuffer();
              const b64 = (function(buf){ let bin=''; const bytes=new Uint8Array(buf); for(let i=0;i<bytes.byteLength;i++) bin+=String.fromCharCode(bytes[i]); return btoa(bin); })(buf);
              await Word.run(async (context) => { context.document.body.insertFileFromBase64(b64, Word.InsertLocation.replace); await context.sync(); });
            } else {
              setDocumentSource(withRev);
              addLog(`doc src userSwitch -> ${withRev}`, 'document');
            }
          } catch {}
        })();
      }, [userId]);

      async function exportWordDocumentAsBase64() {
        function u8ToB64(u8) { let bin=''; for (let i=0;i<u8.length;i++) bin+=String.fromCharCode(u8[i]); return btoa(bin); }
        function normalizeSliceToB64(data) {
          if (typeof data === 'string') return data;
          if (data && data.byteLength !== undefined) {
            const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
            return u8ToB64(u8);
          }
          if (Array.isArray(data) && data.length) {
            if (typeof data[0] === 'string') return data.join('');
            if (typeof data[0] === 'number') return u8ToB64(new Uint8Array(data));
            if (Array.isArray(data[0]) || (data[0] && data[0].byteLength !== undefined)) {
              // Flatten one level
              let total = 0; for (const part of data) total += (part?.length ?? (part?.byteLength ?? 0));
              const out = new Uint8Array(total);
              let off = 0;
              for (const part of data) {
                if (!part) continue;
                const u8 = part instanceof Uint8Array ? part : (part.byteLength !== undefined ? new Uint8Array(part) : new Uint8Array(part));
                out.set(u8, off); off += u8.length;
              }
              return u8ToB64(out);
            }
          }
          return '';
        }
        return new Promise((resolve, reject) => {
          try {
            if (typeof Office === 'undefined') return reject('no_office');
            Office.context.document.getFileAsync(Office.FileType.Compressed, { sliceSize: 65536 }, (result) => {
              if (result.status !== Office.AsyncResultStatus.Succeeded) return reject('getFile_failed');
              const file = result.value;
              const sliceCount = file.sliceCount;
              let acc = '';
              let index = 0;
              const readNext = () => {
                file.getSliceAsync(index, (res) => {
                  if (res.status !== Office.AsyncResultStatus.Succeeded) { try { file.closeAsync(); } catch {}; return reject('getSlice_failed'); }
                  const part = res.value && res.value.data;
                  acc += normalizeSliceToB64(part);
                  index++;
                  if (index < sliceCount) return readNext();
                  try { file.closeAsync(); } catch {}
                  resolve(acc);
                });
              };
              readNext();
            });
          } catch (e) { reject(e); }
        });
      }

      async function saveProgressWord() {
        const b64 = await exportWordDocumentAsBase64();
        if (!b64 || b64.length < 1024) throw new Error(`word_export_small ${b64 ? b64.length : 0}`);
        const r = await fetch(`${API_BASE}/api/v1/save-progress`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, base64: b64, platform: 'word' }) });
        if (!r.ok) {
          let msg = '';
          try { const j = await r.json(); msg = j && (j.error || j.message) || ''; } catch { try { msg = await r.text(); } catch {} }
          throw new Error(`save-progress ${r.status} ${msg}`.trim());
        }
      }

      async function saveProgressWebViaDownload() {
        // Web must export from live editor; no fallback to server bytes
        if (!(window.superdocAPI && typeof window.superdocAPI.export === 'function')) {
          addLog('Document export not available', 'warning');
          throw new Error('export_unavailable');
        }
        const b64 = await window.superdocAPI.export('docx');
        const size = (() => { try { return atob(b64 || '').length; } catch { return 0; } })();
        const pk = (() => { try { const u = new Uint8Array(atob(b64||'').split('').map(c=>c.charCodeAt(0))); return u[0]===0x50 && u[1]===0x4b; } catch { return false; } })();
        addLog(`Document exported (${Math.round(size/1024)}KB)`, 'document');
        if (!b64 || size < 1024 || !pk) {
          addLog('Document export failed - invalid format', 'error');
          throw new Error('export_invalid');
        }
        const r = await fetch(`${API_BASE}/api/v1/save-progress`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, base64: b64, platform: 'web' }) });
        if (!r.ok) {
          let msg = '';
          try { const j = await r.json(); msg = j && (j.error || j.message) || ''; } catch { try { msg = await r.text(); } catch {} }
          addLog(`Failed to save progress: ${msg || 'Server error'}`, 'error');
          throw new Error(`save-progress ${r.status} ${msg}`.trim());
        }
        addLog('Progress saved successfully', 'success');
      }

      const actions = React.useMemo(() => ({
        // finalize/unfinalize removed
        checkout: async () => { 
          
          try { 
            const clientVersionToSend = (viewingVersion || loadedVersion || 0);
            
            const response = await fetch(`${API_BASE}/api/v1/checkout`, { 
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' }, 
              body: JSON.stringify({ userId, clientVersion: clientVersionToSend }) 
            });
            
            
            if (response.ok) {
              addLog('Document checked out successfully', 'success'); 
              await refresh(); 
            } else {
              const errorData = await response.json();
              if (errorData.error === 'version_outdated') {
                // Show modal for version outdated
                
                try { 
                  window.dispatchEvent(new CustomEvent('react:open-modal', { 
                    detail: { 
                      id: 'version-outdated-checkout', 
                      options: { 
                        currentVersion: errorData.currentVersion,
                        clientVersion: errorData.clientVersion,
                        viewingVersion: viewingVersion || loadedVersion || 0,
                        message: errorData.message,
                        userId: userId
                      } 
                    } 
                  })); 
                } catch (e) {
                  console.error('Error dispatching modal event:', e);
                }
              } else {
                addLog(`Failed to check out document: ${errorData.error || 'Unknown error'}`, 'error');
              }
            }
          } catch (e) { 
            addLog(`Failed to check out document: ${e?.message||e}`, 'error'); 
          } 
        },
        checkin: async () => { try { await fetch(`${API_BASE}/api/v1/checkin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) }); addLog('Document checked in successfully', 'success'); await refresh(); } catch (e) { addLog(`Failed to check in document: ${e?.message||e}`, 'error'); } },
        cancel: async () => { try { await fetch(`${API_BASE}/api/v1/checkout/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) }); addLog('Checkout cancelled successfully', 'success'); await refresh(); } catch (e) { addLog(`Failed to cancel checkout: ${e?.message||e}`, 'error'); } },
        override: async () => { try { await fetch(`${API_BASE}/api/v1/checkout/override`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) }); addLog('Checkout override successful', 'warning'); await refresh(); } catch (e) { addLog(`Failed to override checkout: ${e?.message||e}`, 'error'); } },
        factoryReset: async () => { try { await fetch(`${API_BASE}/api/v1/factory-reset`, { method: 'POST' }); addLog('System reset completed successfully', 'system'); try { window.dispatchEvent(new CustomEvent('versions:update')); } catch {} await refresh(); } catch (e) { addLog(`Failed to reset system: ${e?.message||e}`, 'error'); } },
        sendVendor: (opts) => { try { window.dispatchEvent(new CustomEvent('react:open-modal', { detail: { id: 'send-vendor', options: { userId, ...(opts||{}) } } })); } catch {} },
        saveProgress: async () => {
          try {
            const isWordHost = (typeof Office !== 'undefined');
            if (isWordHost) { await saveProgressWord(); } else { await saveProgressWebViaDownload(); }
            addLog('Progress saved successfully', 'success');
            // Fetch updated matrix first so local version state updates before any refresh-driven banner logic
            try {
              const plat = isWordHost ? 'word' : 'web';
              const u = `${API_BASE}/api/v1/state-matrix?platform=${plat}&userId=${encodeURIComponent(userId)}`;
              const r = await fetch(u);
              if (r && r.ok) {
                const j = await r.json();
                const v = Number(j?.config?.documentVersion || 0);
                if (Number.isFinite(v) && v > 0) {
                  console.log(`[DEBUG] Setting viewingVersion to ${v} - Source: saveProgress`);
                  try { setViewingVersion(v); } catch {}
                  try { setLoadedVersion(v); } catch {}
                  try { window.dispatchEvent(new CustomEvent('version:view', { detail: { version: v, payload: { threadPlatform: plat } } })); } catch {}
                }
              }
            } catch {}
            // Now refresh other server-driven state (banners list, approvals, etc.)
            await refresh();
            return true;
          } catch (e) {
            addLog(`Failed to save progress: ${e?.message||e}`, 'error');
            return false;
          }
        },
        setUser: (nextUserId, nextRole) => {
          try {
            const plat = (typeof Office !== 'undefined') ? 'word' : 'web';
            setUserId(nextUserId);
            if (nextRole) setRole(nextRole);
            // Update user state bridge for SuperDoc
            try {
              if (typeof window !== 'undefined' && window.userStateBridge) {
                window.userStateBridge.userId = nextUserId;
                window.userStateBridge.role = nextRole || window.userStateBridge.role;
                const user = users.find(u => u.id === nextUserId || u.label === nextUserId);
                if (user) {
                  window.userStateBridge.displayName = user.label || nextUserId;
                  window.userStateBridge.email = user.email || '';
                }
              }
            } catch {}
            addLog(`Switched to user: ${nextUserId}`, 'user');
            // Reset loadedVersion to 0 when switching users to avoid stale banner state
            setLoadedVersion(0);
            // Immediately fetch matrix for the new user so buttons (override) reflect correctly
            (async () => {
              try {
                const qs = `platform=${encodeURIComponent(plat)}&userId=${encodeURIComponent(nextUserId)}&clientVersion=0`;
                const r = await fetch(`${API_BASE}/api/v1/state-matrix?${qs}`);
                if (r.ok) {
                  const j = await r.json();
                   
                  setConfig(j.config || null);
                  if (typeof j.revision === 'number') setRevision(j.revision);
                  // Update both viewingVersion and loadedVersion to the newest version for this user
                  try {
                    const v = Number(j?.config?.documentVersion || 0);
                    if (Number.isFinite(v) && v > 0) {
                      console.log(`[DEBUG] Setting viewingVersion to ${v} - Source: userSwitch`);
                      setViewingVersion(v);
                      setLoadedVersion(v); // Reset loadedVersion to current document version for new user
                      try { window.dispatchEvent(new CustomEvent('version:view', { detail: { version: v, payload: { threadPlatform: plat } } })); } catch {}
                    }
                  } catch {}
                  
                  // Load the latest document for the new user (no banner needed)
                  try {
                    const w = `${API_BASE}/documents/working/default.docx`;
                    const c = `${API_BASE}/documents/canonical/default.docx`;
                    let url = c;
                    try {
                      const h = await fetch(w, { method: 'HEAD' });
                      if (h.ok) {
                        const len = Number(h.headers.get('content-length') || '0');
                        if (Number.isFinite(len) && len > 1024) url = w; // Use working if it exists and is valid
                      }
                    } catch {}
                    const finalUrl = `${url}?rev=${Date.now()}`;
                    if (plat === 'word') {
                      // Load latest document in Word
                      const res = await fetch(finalUrl, { cache: 'no-store' });
                      if (res && res.ok) {
                        const buf = await res.arrayBuffer();
                        const b64 = (function(buf){ let bin=''; const bytes=new Uint8Array(buf); for(let i=0;i<bytes.byteLength;i++) bin+=String.fromCharCode(bytes[i]); return btoa(bin); })(buf);
                        await Word.run(async (context) => { context.document.body.insertFileFromBase64(b64, Word.InsertLocation.replace); await context.sync(); });
                      }
                    } else {
                      // Load latest document in Web
                      setDocumentSource(finalUrl);
                    }
                    addLog(`Loaded latest document for user: ${nextUserId}`, 'success');
                  } catch {}
                }
              } catch {}
            })();
          } catch {}
        },
      }), [API_BASE, refresh, userId, addLog, viewingVersion]);

      return React.createElement(StateContext.Provider, { value: { config, revision, actions, isConnected, lastTs, currentUser: userId, currentRole: role, users, activities, lastSeenActivityId, markActivitiesSeen, logs, addLog, lastSeenLogCount, markNotificationsSeen, documentSource, setDocumentSource, lastError, setLastError: addError, loadedVersion, setLoadedVersion, dismissedVersion, setDismissedVersion, approvalsSummary, approvalsRevision, messagingCount, setMessagingCount, renderNotification, formatNotification, viewingVersion, setViewingVersion, refresh } }, React.createElement(App, { config }));
    }

    function BannerStack(props) {
      const { tokens } = React.useContext(ThemeContext);
      const { config, loadedVersion, setLoadedVersion, dismissedVersion, setDismissedVersion, revision, addLog, setDocumentSource, setViewingVersion } = React.useContext(StateContext);
      const banners = Array.isArray(config?.banners) ? config.banners : [];
      const API_BASE = getApiBase();
      const show = (b) => {
        if (!b) return false;
        // Exclude update_available here; it is rendered in a custom location
        if (b.state === 'update_available') return false;
        return true;
      };
      const refreshNow = async () => {
        try {
          const w = `${API_BASE}/documents/working/default.docx`;
          const c = `${API_BASE}/documents/canonical/default.docx`;
          let url = c;
          try {
            const h = await fetch(w, { method: 'HEAD' });
            if (h.ok) {
              const len = Number(h.headers.get('content-length') || '0');
              if (Number.isFinite(len) && len > MIN_DOCX_SIZE) url = w;
            }
          } catch {}
          const withRev = `${url}?rev=${revision || Date.now()}`;
          if (typeof Office !== 'undefined') {
            const res = await fetch(withRev, { cache: 'no-store' }); if (!res.ok) throw new Error('download');
            const buf = await res.arrayBuffer();
            const b64 = (function(buf){ let bin=''; const bytes=new Uint8Array(buf); for(let i=0;i<bytes.byteLength;i++) bin+=String.fromCharCode(bytes[i]); return btoa(bin); })(buf);
            await Word.run(async (context) => { context.document.body.insertFileFromBase64(b64, Word.InsertLocation.replace); await context.sync(); });
          } else {
            setDocumentSource(withRev);
            addLog(`doc src refreshNow -> ${withRev}`);
          }
          const serverVersion = Number(config?.documentVersion || 0);
          if (Number.isFinite(serverVersion) && serverVersion > 0) {
            console.log(`[DEBUG] Setting viewingVersion to ${serverVersion} - Source: refreshNow`);
            setLoadedVersion(serverVersion);
            try { setViewingVersion(serverVersion); } catch {}
            try {
              const plat = (function(){ try { return (typeof Office !== 'undefined') ? 'word' : 'web'; } catch { return 'web'; } })();
              window.dispatchEvent(new CustomEvent('version:view', { detail: { version: serverVersion, payload: { threadPlatform: plat } } }));
            } catch {}
          }
        } catch {}
      };
      return React.createElement('div', { className: 'd-flex flex-column gap-6 items-center' },
        banners.filter(show).map((b, i) => {
          const t = (tokens && tokens.banner && b && b.state) ? tokens.banner[b.state] : null;
          const dynamicStyle = {
            background: (t && (t.pillBg || t.bg)) || '#eef2ff',
            color: (t && (t.pillFg || t.fg)) || '#1e3a8a',
            border: `1px solid ${(t && t.border) || ((t && (t.pillBg || t.bg)) || '#c7d2fe')}`
          };
          const text = (b && b.title && b.message) ? `${b.title}: ${b.message}` : (b?.title || '');
          return React.createElement('div', { key: `b-${i}`, className: 'banner-item', style: dynamicStyle }, text);
        })
      );
    }

    function ConnectionBadge() {
      const { isConnected, lastTs } = React.useContext(StateContext);
      const when = lastTs ? new Date(lastTs).toLocaleTimeString() : '—';
      return React.createElement('div', { className: 'connection-badge' }, isConnected ? `connected • last: ${when}` : 'disconnected');
    }

    function ActionButtons() {
      const { config, actions, revision, setDocumentSource, addLog, setLoadedVersion, users, currentUser, viewingVersion } = React.useContext(StateContext);
      const [confirm, setConfirm] = React.useState(null);
      const { tokens } = React.useContext(ThemeContext);
      const rootRef = React.useRef(null);

      // Listen for open-new-document event from header button
      React.useEffect(() => {
        function handleOpenNew() {
          openNew();
        }
        window.addEventListener('open-new-document', handleOpenNew);
        return () => window.removeEventListener('open-new-document', handleOpenNew);
      }, []);
      const btns = (config && config.buttons) ? config.buttons : {};
      const ask = (title, message, onConfirm) => setConfirm({ title, message, onConfirm });
      const add = (label, onClick, show, variant, opts = {}) => show
        ? React.createElement(UIButton, Object.assign({ key: label, label, onClick, variant: variant || (label && /^(Check\-in|Save Progress|Cancel Checkout|Override Checkout)/i.test(label) ? 'secondary' : 'primary'), uniform: true }, opts))
        : null;

      // Document controls (moved here so spacing matches other actions)
      const API_BASE = getApiBase();
      const isWord = (typeof Office !== 'undefined');
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
          input.onchange = (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; try { setDocumentSource(f); addLog('doc src set [file]'); } catch {} };
          input.click();
        }
      };
      const viewLatest = async () => {
        const w = `${API_BASE}/documents/working/default.docx`;
        const c = `${API_BASE}/documents/canonical/default.docx`;
        if (isWord) {
          try {
            let url = c;
            try {
              const h = await fetch(w, { method: 'HEAD' });
              if (h.ok) {
                const len = Number(h.headers.get('content-length') || '0');
                if (Number.isFinite(len) && len > MIN_DOCX_SIZE) url = w;
              }
            } catch {}
            const withRev = `${url}?rev=${Date.now()}`;
            const res = await fetch(withRev, { cache: 'no-store' }); if (!res.ok) throw new Error('download');
            const buf = await res.arrayBuffer();
            const b64 = (function(buf){ let bin=''; const bytes=new Uint8Array(buf); for(let i=0;i<bytes.byteLength;i++) bin+=String.fromCharCode(bytes[i]); return btoa(bin); })(buf);
            await Word.run(async (context) => { context.document.body.insertFileFromBase64(b64, Word.InsertLocation.replace); await context.sync(); });
            // Note: Messaging is server-based now, AI chat persists until explicit reset
            // Only factory reset or AI reset button should clear chat history
            try {
              const plat = 'word';
              const u = `${API_BASE}/api/v1/state-matrix?platform=${plat}&clientVersion=0&userId=${encodeURIComponent(String(currentUser||'user1'))}`;
              const r = await fetch(u);
              const j = await r.json();
              const v = Number(j?.config?.documentVersion || 0);
              if (v > 0) {
                setLoadedVersion(v);
                try { setViewingVersion(v); } catch {}
                try { window.dispatchEvent(new CustomEvent('version:view', { detail: { version: v, payload: { threadPlatform: plat } } })); } catch {}
              }
            } catch {}
          } catch {}
        } else {
          try {
            let url = c;
            try {
              const h = await fetch(w, { method: 'HEAD' });
              if (h.ok) {
                const len = Number(h.headers.get('content-length') || '0');
                if (Number.isFinite(len) && len > MIN_DOCX_SIZE) url = w;
              }
            } catch {}
            const finalUrl = `${url}?rev=${Date.now()}`;
            setDocumentSource(finalUrl);
            addLog(`doc src viewLatest -> ${finalUrl}`);
            // Note: Messaging is server-based now, AI chat persists until explicit reset
            // Only factory reset or AI reset button should clear chat history
            try {
              const plat = 'web';
              const u = `${API_BASE}/api/v1/state-matrix?platform=${plat}&clientVersion=0&userId=${encodeURIComponent(String(currentUser||'user1'))}`;
              const r = await fetch(u);
              const j = await r.json();
              const v = Number(j?.config?.documentVersion || 0);
              if (v > 0) {
                setLoadedVersion(v);
                try { setViewingVersion(v); } catch {}
                try { window.dispatchEvent(new CustomEvent('version:view', { detail: { version: v, payload: { threadPlatform: plat } } })); } catch {}
              }
            } catch {}
          } catch {}
        }
      };

      // Menu state and plain text menu items (no UIButton dependency)
      const [menuOpen, setMenuOpen] = React.useState(false);
      const menuItem = (label, onClick, show, opts = {}) => {
        if (!show) return null;
        const className = 'ui-menu__item' + (opts.danger ? ' danger' : '');
        const handler = (e) => { try { e.stopPropagation?.(); } catch {} try { setMenuOpen(false); } catch {} try { setCheckinMenuOpen(false); } catch {} try { onClick?.(e); } catch {} };
        const onKey = (e) => { try { if (e && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handler(e); } } catch {} };
        return React.createElement('div', { key: label, role: 'menuitem', tabIndex: 0, className, onClick: handler, onKeyDown: onKey }, label);
      };
      const menuItemTwo = (opts) => {
        const { icon, title, subtitle, onClick, show, danger } = opts || {};
        if (!show) return null;
        const className = 'ui-menu__item ui-menu__item--two' + (danger ? ' danger' : '');
        const handler = (e) => { try { e.stopPropagation?.(); } catch {} try { setMenuOpen(false); } catch {} try { setCheckinMenuOpen(false); } catch {} try { onClick?.(e); } catch {} };
        const onKey = (e) => { try { if (e && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handler(e); } } catch {} };
        const iconEl = React.createElement('span', { className: 'ui-menu__icon', 'aria-hidden': true }, icon || '•');
        const titleEl = React.createElement('div', { className: 'ui-menu__title' }, title || '');
        const subEl = React.createElement('div', { className: 'ui-menu__subtitle' }, subtitle || '');
        const textEl = React.createElement('div', { className: 'ui-menu__text' }, [titleEl, subEl]);
        return React.createElement('div', { key: (title || Math.random()), role: 'menuitem', tabIndex: 0, className, onClick: handler, onKeyDown: onKey }, [iconEl, textEl]);
      };

      // Portal menu to escape overflow clipping
      function PortalMenu(props) {
        const { anchorRef, open, children, onClose, align, menuElRef } = props || {};
        const [pos, setPos] = React.useState(null);
        const menuRef = React.useRef(null);
        React.useLayoutEffect(() => {
          if (!open || !anchorRef || !anchorRef.current) return;
          try {
            const r = anchorRef.current.getBoundingClientRect();
            const coords = { top: r.bottom, left: (align === 'left' ? r.left : r.right), width: undefined };
            setPos(coords);
          } catch {}
        }, [open, anchorRef, align]);
        React.useEffect(() => {
          if (!open) return;
          const onKey = (e) => { try { if (e.key === 'Escape') onClose?.(); } catch {} };
          const onDocClick = (e) => {
            try {
              const a = anchorRef && anchorRef.current;
              const m = menuRef && menuRef.current;
              if (a && (a === e.target || a.contains(e.target))) return; // ignore clicks on anchor
              if (m && (m === e.target || m.contains(e.target))) return; // ignore clicks inside menu
              onClose?.();
            } catch {}
          };
          const onScroll = () => { try { onClose?.(); } catch {} };
          window.addEventListener('keydown', onKey);
          window.addEventListener('click', onDocClick, true);
          window.addEventListener('scroll', onScroll, true);
          window.addEventListener('resize', onScroll);
          return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('click', onDocClick, true);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onScroll);
          };
        }, [open, anchorRef, onClose]);
        if (!open || !pos) return null;
        const style = {
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          transform: (align === 'left' ? 'translateX(0)' : 'translateX(-100%)'),
          zIndex: 10000
        };
        return ReactDOM.createPortal(React.createElement('div', { style, ref: (el) => { menuRef.current = el; try { if (menuElRef) menuElRef.current = el; } catch {} } }, children), document.body);
      }
      const nestedItems = [
        menuItem('Send to Vendor', () => { try { setTimeout(() => { try { actions.sendVendor({}); } catch {} }, 130); } catch {} }, !!btns.sendVendorBtn),
        menuItem('Request review', () => { try { window.dispatchEvent(new CustomEvent('react:open-modal', { detail: { id: 'request-review' } })); } catch {} }, true),
        menuItem('Compile', () => { try { setTimeout(() => { try { window.dispatchEvent(new CustomEvent('react:open-modal', { detail: { id: 'compile' } })); } catch {} }, 130); } catch {} }, true),
        menuItem('Override Checkout', actions.override, !!btns.overrideBtn),
        menuItem('Factory Reset', () => ask('Factory reset?', 'This will clear working data.', actions.factoryReset), true, { danger: true }),
      ].filter(Boolean);

      // Compute special case: only checkout is available (plus menu)
      const onlyCheckout = !!btns.checkoutBtn && !btns.checkinBtn && !btns.cancelBtn && !btns.saveProgressBtn && !btns.overrideBtn;

      // Top: checkout cluster with menu immediately adjacent (default)
      const menuAnchorRef = React.useRef(null);
      const topCluster = [
        add('Checkout', actions.checkout, !!btns.checkoutBtn),
        React.createElement('div', { style: { position: 'relative' } }, [
          React.createElement('span', { key: 'anchor', ref: menuAnchorRef },
            add('⋮', () => setMenuOpen(!menuOpen), true, 'secondary', { style: { minWidth: '37px' } })
          ),
          React.createElement(PortalMenu, { key: 'menu', anchorRef: menuAnchorRef, open: !!(nestedItems.length && menuOpen), onClose: () => setMenuOpen(false), align: 'right' },
            React.createElement('div', { className: 'ui-menu', role: 'menu' }, nestedItems)
          )
        ]),
        add('Check-in and Save', async () => { try { const ok = await actions.saveProgress(); if (ok) { await actions.checkin(); } } catch {} }, !!btns.checkinBtn),
        add('Cancel Checkout', actions.cancel, !!btns.cancelBtn),
        add('Save Progress', actions.saveProgress, !!btns.saveProgressBtn),
        add('Override Checkout', actions.override, !!btns.overrideBtn),
      ].filter(Boolean);

      // Bottom: all other actions, with '...' for menu
      const bottomGrid = [
        
      ].filter(Boolean);

      // Read server-provided primary layout mode
      const mode = (config && config.buttons && config.buttons.primaryLayout && config.buttons.primaryLayout.mode)
        || (onlyCheckout ? 'not_checked_out' : (btns.checkinBtn ? 'self' : 'not_checked_out'));
      const [checkinMenuOpen, setCheckinMenuOpen] = React.useState(false);
      const portalMenuRef = React.useRef(null);
      const checkinPortalMenuRef = React.useRef(null);
      // Close any open dropdowns when mode changes (e.g., after Checkout)
      React.useEffect(() => { try { setMenuOpen(false); setCheckinMenuOpen(false); } catch {} }, [mode]);

      // Close menus when clicking outside of ActionButtons or the portal menus (web and add-in)
      React.useEffect(() => {
        const onOutside = (e) => {
          try {
            if (!menuOpen && !checkinMenuOpen) return;
            const el = rootRef.current;
            const menuEl = portalMenuRef && portalMenuRef.current;
            const checkinEl = checkinPortalMenuRef && checkinPortalMenuRef.current;
            if (el && el.contains(e.target)) return; // click inside the toolbar area
            if (menuEl && menuEl.contains(e.target)) return; // click inside portal menu
            if (checkinEl && checkinEl.contains(e.target)) return; // click inside check-in portal menu
          } catch {}
          try { setMenuOpen(false); } catch {}
          try { setCheckinMenuOpen(false); } catch {}
        };
        document.addEventListener('click', onOutside, false);
        return () => { document.removeEventListener('click', onOutside, false); };
      }, [menuOpen, checkinMenuOpen]);

      // Allow ESC to close any open menus
      React.useEffect(() => {
        const onKey = (e) => {
          try { if (e && (e.key === 'Escape' || e.key === 'Esc')) { setMenuOpen(false); setCheckinMenuOpen(false); } } catch {}
        };
        document.addEventListener('keydown', onKey, true);
        return () => { document.removeEventListener('keydown', onKey, true); };
      }, []);

      const topLayout = (function(){
        if (mode === 'not_checked_out') {
          return React.createElement('div', { className: 'd-flex items-center gap-8' }, [
            add('Checkout', actions.checkout, !!btns.checkoutBtn, undefined, { style: { width: '90%' } }),
            React.createElement('div', { style: { position: 'relative', flex: '0 0 auto', marginLeft: 'auto' } }, [
              React.createElement('span', { key: 'anchor_nc', ref: menuAnchorRef },
                add('⋮', () => setMenuOpen(!menuOpen), true, 'secondary', { style: { minWidth: '75px' } })
              ),
              React.createElement(PortalMenu, { key: 'menu_nc', anchorRef: menuAnchorRef, open: !!(nestedItems.length && menuOpen), onClose: () => setMenuOpen(false), align: 'right', menuElRef: portalMenuRef },
                React.createElement('div', { className: 'ui-menu', role: 'menu' }, nestedItems)
              )
            ])
          ]);
        }
        if (mode === 'self') {
          return React.createElement('div', { className: 'd-flex items-center gap-8' }, [
            add('Save', actions.saveProgress, !!btns.saveProgressBtn, 'primary', { style: { flex: '1 1 0', width: '100%' } }),
            React.createElement('div', { style: { position: 'relative', flex: '1 1 0' } }, [
              React.createElement('span', { key: 'anchor_ci', ref: menuAnchorRef },
                add('Check-in ▾', () => setCheckinMenuOpen(!checkinMenuOpen), !!btns.checkinBtn, 'secondary', { style: { width: '100%' } })
              ),
              (checkinMenuOpen ? React.createElement(PortalMenu, { anchorRef: menuAnchorRef, open: true, onClose: () => setCheckinMenuOpen(false), align: 'right', menuElRef: checkinPortalMenuRef }, React.createElement('div', { className: 'ui-menu', role: 'menu' }, [
                menuItemTwo({
                  icon: '🗝️',
                  title: 'Save and Check In',
                  subtitle: 'Save your progress and check in the document.',
                  onClick: async () => { try { const ok = await actions.saveProgress(); if (ok) await actions.checkin(); } catch {} },
                  show: !!btns.checkinBtn
                }),
                menuItemTwo({
                  icon: '➤',
                  title: 'Cancel Checkout',
                  subtitle: 'Cancel changes and check in the document.',
                  onClick: async () => { try { await actions.cancel(); } catch {} },
                  show: !!btns.checkinBtn
                })
              ])) : null)
            ]),
            React.createElement('div', { style: { position: 'relative', marginLeft: 'auto' } }, [
              React.createElement('span', { key: 'anchor_r', ref: menuAnchorRef },
                add('⋮', () => setMenuOpen(!menuOpen), true, 'secondary', { style: { minWidth: '75px' } })
              ),
              React.createElement(PortalMenu, { key: 'menu_r', anchorRef: menuAnchorRef, open: !!(nestedItems.length && menuOpen), onClose: () => setMenuOpen(false), align: 'right', menuElRef: portalMenuRef },
                React.createElement('div', { className: 'ui-menu', role: 'menu' }, nestedItems)
              )
            ])
          ]);
        }
        // mode === 'other'
        return React.createElement('div', { className: 'd-flex items-center gap-8 flex-wrap' }, [
          (function(){
            try {
              const uid = (config && config.checkoutStatus && config.checkoutStatus.checkedOutUserId) || '';
              const match = (Array.isArray(users) ? users.find(u => (u && (u.id === uid || u.label === uid)) ) : null);
              const name = (match && (match.label || match.id)) || uid || 'someone';
              const when = (config && config.lastUpdated) ? new Date(config.lastUpdated).toLocaleDateString() : '';
              const text = `Checked out by ${name}${when ? (' on ' + when) : ''}`;
              return React.createElement('div', { className: 'text-sm text-gray-700' }, text);
            } catch { return React.createElement('div', { className: 'text-sm text-gray-700' }, 'Checked out by someone'); }
          })(),
          React.createElement('div', { style: { position: 'relative', marginLeft: 'auto' } }, [
            React.createElement('span', { key: 'anchor_o', ref: menuAnchorRef },
              add('⋮', () => setMenuOpen(!menuOpen), true, 'secondary', { style: { minWidth: '75px' } })
            ),
            React.createElement(PortalMenu, { key: 'menu_o', anchorRef: menuAnchorRef, open: !!(nestedItems.length && menuOpen), onClose: () => setMenuOpen(false), align: 'right', menuElRef: portalMenuRef },
              React.createElement('div', { className: 'ui-menu', role: 'menu' }, nestedItems)
            )
          ])
        ]);
      })();

      // Show banner if viewing old version
      const isViewingOldVersion = (() => {
        try {
          const currentVersion = Number(config?.documentVersion || 1);
          const viewing = Number(viewingVersion || 1);
          return viewing < currentVersion;
        } catch {
          return false;
        }
      })();
      
      const showUpdateBanner = isViewingOldVersion;
      const updateBannerParts = (function(){
        try {
          if (isViewingOldVersion) {
            const currentVersion = Number(config?.documentVersion || 1);
          return {
              title: 'New Version Available',
              message: `You're viewing version ${viewingVersion}, the latest is ${currentVersion}.`
          };
          }
          return { title: '', message: '' };
        } catch { return { title: '', message: '' }; }
      })();

      return React.createElement('div', { ref: rootRef, className: 'd-flex flex-column gap-6' },
        topLayout,
        (showUpdateBanner ? (
          React.createElement('div', { className: 'update-banner' },
            React.createElement('div', { style: { position: 'relative', width: '100%' } }, [
              React.createElement('div', { key: 'row', style: { display: 'grid', gridTemplateColumns: '24px 1fr auto', alignItems: 'center', columnGap: 12 } }, [
                // Icon
                React.createElement('div', { key: 'icon', style: { width: 24, height: 24, borderRadius: '50%', border: '2px solid currentColor', color: '#0E6F7F', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 } }, 'i'),
                // Text (title + message)
                React.createElement('div', { key: 'text', style: { color: 'inherit', textAlign: 'left' } }, [
                  updateBannerParts.title ? React.createElement('div', { key: 't', style: { fontWeight: 700, color: '#0E6F7F' } }, updateBannerParts.title) : null,
                  updateBannerParts.message ? React.createElement('div', { key: 'm' }, updateBannerParts.message) : null,
                ]),
                // Tertiary button aligned with title baseline
                React.createElement('button', {
                  key: 'btn',
                  onClick: viewLatest,
                  title: 'View latest',
                  style: {
                    background: 'transparent', border: 'none', padding: 0, margin: 0,
                    color: 'inherit', cursor: 'pointer', font: 'inherit', textDecoration: 'underline', alignSelf: 'center', marginTop: 2
                  }
                }, 'View latest')
              ])
            ])
          )
        ) : null),
        React.createElement('div', { className: 'd-grid grid-cols-2 column-gap-8 row-gap-6 grid-auto-rows-minmax-27' }, bottomGrid),
        confirm ? React.createElement(ConfirmModal, { title: confirm.title, message: confirm.message, onConfirm: confirm.onConfirm, onClose: () => setConfirm(null) }) : null
      );
    }

    function ExhibitsList() {
      const API_BASE = getApiBase();
      const [items, setItems] = React.useState([]);
      const refresh = React.useCallback(async () => { try { const r = await fetch(`${API_BASE}/api/v1/exhibits`); if (r.ok) { const j = await r.json(); setItems(Array.isArray(j.items) ? j.items : []); } } catch {} }, [API_BASE]);
      React.useEffect(() => { refresh(); }, [refresh]);
      return React.createElement('div', null,
        React.createElement('div', { className: 'font-semibold mt-2' }, 'Exhibits'),
        items.length ? React.createElement('ul', null, items.map((it, i) => React.createElement('li', { key: i }, React.createElement('a', { href: it.url, target: '_blank' }, it.name)))) : React.createElement('div', null, '(none)')
      );
    }

    function BannerDropEffect() {
      const [showBanner, setShowBanner] = React.useState(false);

      // Listen for status change to 'final'
      React.useEffect(() => {
        const handleStatusChange = (event) => {
          try {
            const data = event.detail || {};
            console.log('🎉 Banner: Status change event received:', data);
            // Check if status changed to 'final'
            if (data.status === 'final') {
              console.log('🎉 Banner: Triggering banner drop!');
              setShowBanner(true);
              
              // Auto-dismiss after 4 seconds
              setTimeout(() => {
                setShowBanner(false);
              }, 4000);
            }
          } catch (err) {
            console.error('❌ Banner error:', err);
          }
        };

        // Listen for custom status:change events dispatched from main SSE handler
        window.addEventListener('status:change', handleStatusChange);
        return () => window.removeEventListener('status:change', handleStatusChange);
      }, []);

      if (!showBanner) return null;

      // Check if we're in web (has navbar) or add-in (no navbar)
      const isWeb = typeof Office === 'undefined';
      const topOffset = isWeb ? '48px' : 0; // Web has 48px navbar at top

      // Banner styles
      const bannerContainer = {
        position: 'fixed',
        top: topOffset,
        left: 0,
        right: 0,
        zIndex: 10000,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none'
      };

      const banner = {
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: '#ffffff',
        padding: '20px 40px',
        borderRadius: '0 0 12px 12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        fontSize: '24px',
        fontWeight: 'bold',
        textAlign: 'center',
        animation: 'bannerDrop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
        pointerEvents: 'auto',
        minWidth: '400px',
        maxWidth: '90vw'
      };

      const icon = {
        display: 'inline-block',
        marginRight: '12px',
        fontSize: '28px'
      };

      const message = {
        display: 'block',
        fontSize: '16px',
        fontWeight: 'normal',
        marginTop: '8px',
        opacity: 0.95
      };

      return React.createElement('div', { style: bannerContainer }, [
        React.createElement('div', { key: 'banner', style: banner }, [
          React.createElement('span', { key: 'icon', style: icon }, '🎉'),
          React.createElement('span', { key: 'title' }, 'Document Finalized!'),
          React.createElement('span', { key: 'message', style: message }, 'Great work finalizing this document!')
        ])
      ]);
    }

    function ApprovalCelebration() {
      const [showCelebration, setShowCelebration] = React.useState(false);

      // Listen for approval completion events
      React.useEffect(() => {
        const handleApprovalComplete = (event) => {
          try {
            const data = event.detail || {};
            if (data.type === 'approval:complete') {
              setShowCelebration(true);
              
              // Trigger confetti.js celebration
              if (window.confetti) {
                // Multiple bursts for epic celebration
                const duration = 5000;
                const animationEnd = Date.now() + duration;
                
                const randomInRange = (min, max) => Math.random() * (max - min) + min;
                
                const interval = setInterval(() => {
                  const timeLeft = animationEnd - Date.now();
                  
                  if (timeLeft <= 0) {
                    clearInterval(interval);
                    setShowCelebration(false);
                    return;
                  }
                  
                  // Random confetti bursts
                  const particleCount = randomInRange(50, 200);
                  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff', '#ff4757', '#2ed573', '#ffa502'];
                  
                  window.confetti({
                    particleCount: particleCount,
                    angle: randomInRange(45, 135),
                    spread: randomInRange(50, 120),
                    origin: { x: randomInRange(0.1, 0.9), y: randomInRange(0.1, 0.3) },
                    colors: colors,
                    shapes: ['circle', 'square'],
                    scalar: randomInRange(0.5, 2)
                  });
                  
                  // Side bursts
                  if (Math.random() > 0.7) {
                    window.confetti({
                      particleCount: randomInRange(30, 100),
                      angle: randomInRange(60, 120),
                      spread: randomInRange(30, 80),
                      origin: { x: Math.random() > 0.5 ? 0 : 1, y: randomInRange(0.3, 0.7) },
                      colors: colors,
                      shapes: ['circle', 'square'],
                      scalar: randomInRange(0.5, 1.5)
                    });
                  }
                }, 200);
              }
            }
          } catch {}
        };

        window.addEventListener('approval:complete', handleApprovalComplete);
        return () => window.removeEventListener('approval:complete', handleApprovalComplete);
      }, []);

      return null; // No DOM elements needed - confetti.js handles everything
    }

    function ActivityPanel(props) {
      const { isActive } = props;
      const { activities, renderNotification, markActivitiesSeen } = React.useContext(StateContext);
      // Only mark activities as seen when the tab is actually active
      React.useEffect(() => { 
        if (isActive) {
          try { markActivitiesSeen?.(); } catch {} 
        }
      }, [isActive, markActivitiesSeen]);
      const copy = async () => {
        try {
          const text = (activities || []).slice().reverse().map(activity => {
            if (typeof activity === 'string') return activity;
            const timestamp = activity.timestamp ? new Date(activity.timestamp).toLocaleString() : 'Unknown';
            return `[${timestamp}] ${activity.message || activity.action || 'Unknown activity'}`;
          }).join('\n');
          if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(text);
        } catch {}
      };
      const exportToCSV = () => {
        try {
          // Build CSV with headers
          const headers = ['Timestamp', 'Type', 'User', 'Action', 'Target', 'Message'];
          const rows = (activities || []).slice().reverse().map(activity => {
            if (typeof activity === 'string') {
              return [activity, '', '', '', '', activity];
            }
            const timestamp = activity.timestamp ? new Date(activity.timestamp).toLocaleString() : '';
            const type = activity.type || '';
            const user = activity.user || '';
            const action = activity.action || '';
            const target = activity.target || '';
            const message = activity.message || '';
            // Escape CSV values (wrap in quotes if they contain commas, quotes, or newlines)
            const escape = (val) => {
              const str = String(val || '');
              if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return '"' + str.replace(/"/g, '""') + '"';
              }
              return str;
            };
            return [timestamp, type, user, action, target, message].map(escape);
          });
          const csv = [headers.join(',')].concat(rows.map(row => row.join(','))).join('\n');
          
          // Create download link
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          const url = URL.createObjectURL(blob);
          link.setAttribute('href', url);
          link.setAttribute('download', `activity-log-${new Date().toISOString().slice(0, 10)}.csv`);
          link.style.visibility = 'hidden';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        } catch (err) {
          console.error('Failed to export CSV:', err);
        }
      };
      const isAddin = typeof Office !== 'undefined';
      const list = (activities || []).length
        ? React.createElement('div', { className: 'notifications-list', style: { maxHeight: 'none', overflow: 'visible' } }, (activities || []).slice().reverse().map((activity, index) => renderNotification(activity, index)).filter(Boolean))
        : React.createElement('div', { className: 'text-gray-500', style: { padding: 8 } }, 'No activity yet.');
      
      const footerBar = React.createElement('div', { 
        className: 'd-flex flex-column gap-8', 
        style: { 
          width: '100%', 
          boxSizing: 'border-box', 
          paddingTop: 8, 
          paddingBottom: isAddin ? 8 : 12, 
          paddingLeft: isAddin ? 0 : 12, 
          paddingRight: isAddin ? 0 : 12 
        } 
      }, [
        React.createElement(UIButton, { key: 'copy', label: 'Copy', onClick: copy, variant: 'primary' }),
        React.createElement(UIButton, { key: 'export', label: 'Export to CSV', onClick: exportToCSV, variant: 'secondary' })
      ]);
      
      const wrap = React.createElement('div', { style: { width: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } }, [
        React.createElement('div', { key: 'list', style: { flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: isAddin ? '8px' : '12px' } }, [list]),
        React.createElement('div', { key: 'footer', style: { flexShrink: 0, background: '#fff', borderTop: '1px solid #e5e7eb' } }, [footerBar])
      ]);
      
      return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, height: '100%' } }, [wrap]);
    }

    function MessagingPanel() {
      const API_BASE = getApiBase();
      const { currentUser, users, setMessagingCount } = React.useContext(StateContext);

      const activeKey = React.useCallback(() => `og.messaging.active.${String(currentUser || 'default')}`, [currentUser]);
      const viewKey = React.useCallback(() => `og.messaging.view.${String(currentUser || 'default')}`, [currentUser]);
      
      // Load messages from server
      const [messages, setMessages] = React.useState([]);
      
      // Fetch messages on mount
      React.useEffect(() => {
        const loadMessages = async () => {
          try {
            const r = await fetch(`${API_BASE}/api/v1/messages`);
            if (r.ok) {
              const j = await r.json();
              if (Array.isArray(j.messages)) setMessages(j.messages);
            }
          } catch {}
        };
        loadMessages();
      }, [API_BASE]);
      
      const [text, setText] = React.useState('');
      const listRef = React.useRef(null);
      const [view, setView] = React.useState(() => {
        try {
          const stored = localStorage.getItem(viewKey());
          if (stored) return stored;
        } catch {}
        return 'list';
      });
      const [activePartnerId, setActivePartnerId] = React.useState(() => {
        try {
          const stored = localStorage.getItem(activeKey());
          if (stored) return stored;
        } catch {}
        return '';
      });
      const [activeGroupIds, setActiveGroupIds] = React.useState([]);
      const [newSelection, setNewSelection] = React.useState(() => new Set());

      const userLabel = (uid) => {
        try { const u = (users || []).find(x => (x && (x.id === uid || x.label === uid))); return (u && (u.label || u.id)) || uid; } catch { return uid; }
      };
      const userLabelById = (uid) => {
        try { const u = (users || []).find(x => (x && x.id === uid)); return (u && (u.label || u.id)) || uid; } catch { return uid; }
      };
      const initialsOf = (label) => {
        try { const parts = String(label || '').trim().split(/\s+/).filter(Boolean); if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase(); if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase(); return ''; } catch { return ''; }
      };

      // Load from localStorage when user changes
      React.useEffect(() => {
        try {
          const storedView = localStorage.getItem(viewKey());
          const storedActive = localStorage.getItem(activeKey());
          
          // Messages loaded from server, just restore UI state
          setView(storedView || 'list');
          setActivePartnerId(storedActive || '');
          setActiveGroupIds([]);
        } catch {
          setView('list');
          setActivePartnerId('');
          setActiveGroupIds([]);
        }
      }, [currentUser, viewKey, activeKey]);
      
      // Messages are now stored on server, not in localStorage
      
      React.useEffect(() => {
        try {
          localStorage.setItem(activeKey(), activePartnerId);
        } catch {}
      }, [activePartnerId, activeKey]);
      
      React.useEffect(() => {
        try {
          localStorage.setItem(viewKey(), view);
        } catch {}
      }, [view, viewKey]);
      React.useEffect(() => {}, [view]);
      
      // Factory reset handler
      React.useEffect(() => {
        const onFactoryReset = () => {
          try {
            setMessages([]);
            setActivePartnerId('');
            setActiveGroupIds([]);
            setView('list');
            localStorage.removeItem(activeKey());
            localStorage.removeItem(viewKey());
          } catch {}
        };
        window.addEventListener('factoryReset', onFactoryReset);
        return () => window.removeEventListener('factoryReset', onFactoryReset);
      }, [activeKey, viewKey]);
      
      // Go home handler (when clicking Messages tab)
      React.useEffect(() => {
        const onGoHome = () => {
          try {
            setView('list');
            setActivePartnerId('');
            setActiveGroupIds([]);
          } catch {}
        };
        window.addEventListener('messaging:goHome', onGoHome);
        return () => window.removeEventListener('messaging:goHome', onGoHome);
      }, []);

      // Inbound messages
      React.useEffect(() => {
        const onMsg = (ev) => {
          try {
            const d = ev.detail || {};
            if (!d || !d.payload) return;
            const from = String(d.userId || '');
            const toRaw = d.payload?.to;
            const to = Array.isArray(toRaw) ? toRaw.map(String) : String(toRaw || '');
            const text = String(d.payload.text || '');
            const clientId = d.payload && d.payload.clientId ? String(d.payload.clientId) : '';
            const threadId = d.payload && d.payload.threadId ? String(d.payload.threadId) : '';
            if (!text) return;
              // Skip if we already have this client-sent message
              if (clientId && Array.isArray(messages) && messages.some(m => m.clientId && String(m.clientId) === clientId)) return;
            // Store ALL messages globally with readBy array to track who has read it
            const readBy = [from]; // Sender has always "read" their own message
            setMessages(prev => prev.concat({ id: Date.now() + Math.random(), from, to, text, ts: Date.now(), clientId: clientId || undefined, threadId: threadId || undefined, readBy }));
          } catch {}
        };
        const onReset = () => {
          try {
            setMessages([]);
            setActivePartnerId('');
            setActiveGroupIds([]);
            setText('');
          } catch {}
        };
        try { window.addEventListener('messaging:message', onMsg); } catch {}
        try { window.addEventListener('messaging:reset', onReset); } catch {}
        return () => {
          try { window.removeEventListener('messaging:message', onMsg); } catch {}
          try { window.removeEventListener('messaging:reset', onReset); } catch {}
        };
      }, [currentUser, messages, activeKey, viewKey]);

      // Do not auto-select a partner on New Chat; user must choose explicitly

      // Scroll thread to bottom
      React.useEffect(() => {
        try { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; } catch {}
      }, [messages, activePartnerId, view]);

      const send = async () => {
        const trimmed = String(text || '').trim();
        const isGroup = Array.isArray(activeGroupIds) && activeGroupIds.length > 0 && !activePartnerId;
        if (!trimmed || (!activePartnerId && !isGroup)) return;
        setText('');
        const clientId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const recipients = isGroup ? activeGroupIds.slice() : [String(activePartnerId)];
        const threadId = isGroup ? `group:${recipients.slice().sort().join(',')}` : `dm:${String(activePartnerId)}`;
        const mine = { id: Date.now() + Math.random(), from: String(currentUser), to: (isGroup ? recipients : String(activePartnerId)), text: trimmed, ts: Date.now(), clientId, threadId, readBy: [String(currentUser)] };
        setMessages(prev => prev.concat(mine));
        try {
          await fetch(`${API_BASE}/api/v1/events/client`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'approvals:message', payload: { to: recipients, text: trimmed, clientId, threadId }, userId: currentUser }) });
        } catch {}
      };

      // Derive conversations (partner -> last message)
      const convMap = (() => {
        const map = new Map();
        for (const m of messages) {
          const me = String(currentUser);
          const toArr = Array.isArray(m.to) ? m.to : [String(m.to || '')];
          if (m.from !== me && !toArr.includes(me)) continue;
          const tid = m.threadId ? String(m.threadId) : (Array.isArray(m.to) ? `group:${toArr.slice().sort().join(',')}` : `dm:${(m.from === me ? String(m.to) : String(m.from))}`);
          const prev = map.get(tid);
          if (!prev || (m.ts || 0) > (prev.ts || 0)) map.set(tid, m);
        }
        return map;
      })();
      const conversations = Array.from(convMap.entries())
        .map(([threadId, lastMsg]) => ({ threadId, lastMsg }))
        .sort((a, b) => (b.lastMsg.ts || 0) - (a.lastMsg.ts || 0));

      const activeThreadId = (Array.isArray(activeGroupIds) && activeGroupIds.length > 0 && !activePartnerId)
        ? `group:${activeGroupIds.slice().sort().join(',')}`
        : (activePartnerId ? `dm:${String(activePartnerId)}` : '');

      const threadMessages = messages.filter(m => {
        const me = String(currentUser);
        const tid = m.threadId ? String(m.threadId) : (Array.isArray(m.to) ? `group:${(m.to||[]).slice().sort().join(',')}` : `dm:${(m.from === me ? String(m.to) : String(m.from))}`);
        return activeThreadId && tid === activeThreadId;
      });

      // Update messaging count in context - count unread messages (not read by currentUser)
      React.useEffect(() => {
        if (setMessagingCount) {
          const me = String(currentUser);
          const unreadCount = messages.filter(m => {
            // Message is unread if currentUser is involved (to/from) but not in readBy array
            const toArr = Array.isArray(m.to) ? m.to : [String(m.to || '')];
            const involvesMe = (m.from === me || toArr.includes(me));
            const hasRead = Array.isArray(m.readBy) && m.readBy.includes(me);
            return involvesMe && !hasRead;
          }).length;
          setMessagingCount(unreadCount);
        }
      }, [messages, currentUser, setMessagingCount]);

      // Header
      const headerList = React.createElement('div', { className: 'd-flex items-center justify-end', style: { padding: '4px 8px' } }, [
        React.createElement(UIButton, { key: 'new', label: 'New Chat', variant: 'primary', onClick: () => { setActivePartnerId(''); setView('new'); } })
      ]);

      const listCards = (conversations || []).map((c, i) => {
          const tid = c.threadId;
          const isGroup = String(tid || '').startsWith('group:');
          const label = isGroup
            ? (String(tid).slice(6).split(',').map(s => userLabelById(String(s).trim())).join(', '))
            : userLabel(String(tid).slice(3));
          const preview = (c.lastMsg && c.lastMsg.text) ? c.lastMsg.text : '';
          const time = c.lastMsg && c.lastMsg.ts ? new Date(c.lastMsg.ts).toLocaleTimeString() : '';
          // Check if thread has unread messages (messages not read by currentUser)
          const me = String(currentUser);
          const hasUnread = messages.some(m => {
            const mTid = m.threadId ? String(m.threadId) : (Array.isArray(m.to) ? `group:${(m.to||[]).slice().sort().join(',')}` : `dm:${(m.from === me ? String(m.to) : String(m.from))}`);
            const toArr = Array.isArray(m.to) ? m.to : [String(m.to || '')];
            const involvesMe = (m.from === me || toArr.includes(me));
            const hasRead = Array.isArray(m.readBy) && m.readBy.includes(me);
            return mTid === tid && involvesMe && !hasRead;
          });
          return React.createElement('div', { key: tid || i, onClick: async () => {
              // Mark all messages in this thread as read via API
              try {
                const r = await fetch(`${API_BASE}/api/v1/messages/mark-read`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ threadId: tid, userId: me })
                });
                if (r.ok) {
                  const j = await r.json();
                  if (Array.isArray(j.messages)) setMessages(j.messages);
                }
              } catch {}
              
              if (isGroup) { setActivePartnerId(''); setActiveGroupIds(String(tid).slice(6).split(',').filter(Boolean)); }
              else { setActiveGroupIds([]); setActivePartnerId(String(tid).slice(3)); }
              setView('thread');
            },
            className: `messaging-card ${hasUnread ? 'messaging-card--unread' : ''} d-flex items-center`}, [
              hasUnread ? React.createElement('div', { key: 'badge', className: 'messaging-card__unread-badge' }) : null,
              React.createElement('div', { key: 'av', className: 'avatar-initials', style: { marginRight: 10 } }, initialsOf(label)),
              React.createElement('div', { key: 'txt', className: 'd-flex flex-column', style: { flex: 1, minWidth: 0 } }, [
                React.createElement('div', { key: 'n', className: `messaging-card__name ${hasUnread ? 'messaging-card__name--unread' : ''}`, style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, label),
                React.createElement('div', { key: 'p', className: `messaging-card__preview ${hasUnread ? 'messaging-card__preview--unread' : ''} text-sm text-gray-600`, style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, preview)
              ]),
              React.createElement('div', { key: 't', className: 'text-xs text-gray-500' }, time)
            ]);
        });

      const listView = React.createElement('div', { className: 'd-flex flex-column gap-8' }, [
        headerList,
        (listCards.length
          ? React.createElement('div', { key: 'cards', className: 'd-flex flex-column gap-8' }, listCards)
          : React.createElement('div', { key: 'empty', className: 'text-gray-500', style: { padding: '8px' } }, 'No chats yet. Click New Chat to start.'))
      ]);

      // Contact picker (New Chat)
      const onToggleNewSelect = (pid) => {
        setNewSelection(prev => {
          const n = new Set(prev);
          if (n.has(pid)) n.delete(pid); else n.add(pid);
          return n;
        });
      };

      const startNewChats = () => {
        const ids = Array.from(newSelection);
        if (!ids.length) return;
        if (ids.length === 1) {
          setActiveGroupIds([]);
          setActivePartnerId(ids[0]);
        } else {
          setActivePartnerId('');
          setActiveGroupIds(ids);
        }
        setView('thread');
        setNewSelection(new Set());
      };

      const newChatView = React.createElement('div', { className: 'd-flex flex-column gap-8' }, [
        React.createElement('div', { key: 'hdr', className: 'd-flex items-center justify-between', style: { padding: '4px 8px' } }, [
          React.createElement('div', { key: 'l', className: 'd-flex items-center gap-8' }, [
            React.createElement('button', { key: 'back', onClick: () => setView('list'), style: { background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 18 } }, '⬅'),
            React.createElement('div', { key: 'lbl', className: 'font-semibold' }, 'New Chat')
          ]),
          React.createElement(UIButton, { key: 'start', label: 'Start', onClick: startNewChats, variant: 'primary', disabled: !newSelection.size })
        ]),
        React.createElement('div', { key: 'pick', style: { border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' } },
          React.createElement('div', { style: { maxHeight: 320, overflowY: 'auto', background: '#fff' } },
            (users || []).filter(u => (u?.id || u?.label) && (u.id || u.label) !== currentUser)
              .map((u, i) => {
                const pid = u.id || u.label;
                const label = userLabel(pid);
                const checked = newSelection.has(pid);
                return React.createElement('label', { key: pid || i, className: 'd-flex items-center', style: { padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' } }, [
                  React.createElement('input', { key: 'cb', type: 'checkbox', checked, onChange: () => onToggleNewSelect(pid), style: { marginRight: 10 } }),
                  React.createElement('div', { key: 'av', className: 'avatar-initials', style: { marginRight: 10 } }, initialsOf(label)),
                  React.createElement('div', { key: 'n', className: 'font-medium' }, label)
                ]);
              })
          )
        )
      ]);

      // Thread header and body
      const headerThread = React.createElement('div', { className: 'd-flex items-center gap-8', style: { padding: '4px 8px' } }, [
        React.createElement('button', { key: 'back', onClick: () => setView('list'), style: { background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 18 } }, '⬅'),
        React.createElement('div', { key: 'lbl', className: 'font-semibold' }, (activePartnerId ? userLabel(activePartnerId) : (activeGroupIds || []).map(s => userLabelById(String(s).trim())).join(', ')))
      ]);

      const isGroupThread = !!(activeThreadId && String(activeThreadId).startsWith('group:'));
      function colorClassForUser(uid) {
        try {
          const palette = ['alt-1','alt-2','alt-3','alt-4'];
          let sum = 0; const s = String(uid || '');
          for (let i = 0; i < s.length; i++) sum = (sum + s.charCodeAt(i)) | 0;
          const idx = Math.abs(sum) % palette.length;
          return palette[idx];
        } catch { return 'alt-1'; }
      }
      const threadList = threadMessages.length ? React.createElement('div', { ref: listRef, style: { padding: 8, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' } },
        threadMessages.map(m => {
          const mine = String(m.from) === String(currentUser);
          const rowCls = 'chat-bubble-row ' + (mine ? 'mine' : 'other');
          let bubbleCls = 'chat-bubble ' + (mine ? 'mine' : 'other');
          if (!mine) {
            // DM: light gray; Group: deterministic alternating palette per participant
            if (isGroupThread) {
              bubbleCls += (' ' + colorClassForUser(m.from));
            } else {
              bubbleCls += ' other-gray';
            }
          }
          const ts = m.ts ? new Date(m.ts).toLocaleTimeString() : '';
          return React.createElement('div', { key: m.id, className: rowCls }, [
            React.createElement('div', { key: 'ts', className: 'chat-timestamp ' + (mine ? 'mine' : 'other') }, ts),
            React.createElement('div', { key: 'b', className: bubbleCls }, String(m.text || ''))
          ]);
        })
      ) : null;

      const onComposerKeyDown = (e) => {
        try {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
        } catch {}
      };
      const composer = React.createElement('div', { className: 'd-flex items-center gap-8' }, [
        React.createElement('input', { key: 'inp', type: 'text', placeholder: 'Write a message…', value: text, onChange: (e) => setText(e.target.value), onKeyDown: onComposerKeyDown, className: 'input-padding input-border input-border-radius', style: { flex: 1 } }),
        React.createElement(UIButton, { key: 'send', label: 'Send', onClick: send, variant: 'primary', disabled: (!activePartnerId && (!(Array.isArray(activeGroupIds) && activeGroupIds.length))) })
      ]);

      const threadView = React.createElement('div', { className: 'd-flex flex-column gap-8' }, [headerThread, (threadList || null), composer]);

      return (view === 'list') ? listView : (view === 'new' ? newChatView : threadView);
    }

    // Word add-in: listen for navigation events and jump to text
    try {
      if (typeof window !== 'undefined') {
        window.removeEventListener && window.removeEventListener('document:navigate', window.__ogDocNavigateHandler || (()=>{}));
        const handler = async (event) => {
          try {
            const detail = event && event.detail ? event.detail : (event && event.payload ? event.payload : {});
            const text = String(detail && (detail.text || ''));
            const changeType = String(detail && (detail.changeType || 'change'));
            const contextBefore = String(detail && (detail.contextBefore || ''));
            const contextAfter = String(detail && (detail.contextAfter || ''));
            const targetVersion = Number(detail && detail.targetVersion ? detail.targetVersion : 0);
            console.log('[UI] document:navigate event', { textLen: text.length, changeType, hasCtx: !!(contextBefore || contextAfter) });
            if (!text || typeof Office === 'undefined' || typeof Word === 'undefined') return;
            // If a specific version is provided, load it first so deleted text context exists
            if (Number.isFinite(targetVersion) && targetVersion > 0) {
              try { window.dispatchEvent(new CustomEvent('version:view', { detail: { version: targetVersion } })); } catch {}
              await new Promise(res => setTimeout(res, 900));
            }
            await Word.run(async (context) => {
              const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
              const searchText = norm(text);
              const beforeNorm = norm(contextBefore);
              const afterNorm = norm(contextAfter);
              const opts = { matchCase: false, matchWholeWord: false, ignorePunct: true, ignoreSpace: true };

              let searchResults = context.document.body.search(searchText, opts);
              searchResults.load('items');
              await context.sync();
              if (!(searchResults.items && searchResults.items.length > 0) && (beforeNorm || afterNorm)) {
                const contextWindow = `${beforeNorm} ${searchText} ${afterNorm}`.slice(0, 500);
                searchResults = context.document.body.search(contextWindow, opts);
                searchResults.load('items');
                await context.sync();
              }
              if (!(searchResults.items && searchResults.items.length > 0) && beforeNorm) {
                const beforeOnly = String(beforeNorm).slice(-200);
                searchResults = context.document.body.search(beforeOnly, opts);
                searchResults.load('items');
                await context.sync();
              }
              if (!(searchResults.items && searchResults.items.length > 0) && afterNorm) {
                const afterOnly = String(afterNorm).slice(0, 200);
                searchResults = context.document.body.search(afterOnly, opts);
                searchResults.load('items');
                await context.sync();
              }
              if (!(searchResults.items && searchResults.items.length > 0)) {
                const token = (searchText.split(/\s+/).find(t => t && t.length >= 4)) || searchText;
                searchResults = context.document.body.search(token, opts);
                searchResults.load('items');
                await context.sync();
              }
              // Final fallback for very small insertions: anchor near context edges
              if (!(searchResults.items && searchResults.items.length > 0) && (beforeNorm || afterNorm)) {
                const beforeWords = beforeNorm ? beforeNorm.split(/\s+/).filter(Boolean) : [];
                const afterWords = afterNorm ? afterNorm.split(/\s+/).filter(Boolean) : [];
                const beforeAnchor = beforeWords.length ? beforeWords.slice(Math.max(0, beforeWords.length - 5)).join(' ') : '';
                const afterAnchor = afterWords.length ? afterWords.slice(0, Math.min(5, afterWords.length)).join(' ') : '';
                if (beforeAnchor) {
                  searchResults = context.document.body.search(beforeAnchor, opts);
                  searchResults.load('items');
                  await context.sync();
                }
                if (!(searchResults.items && searchResults.items.length > 0) && afterAnchor) {
                  searchResults = context.document.body.search(afterAnchor, opts);
                  searchResults.load('items');
                  await context.sync();
                }
              }
              if (searchResults.items && searchResults.items.length > 0) {
                const range = searchResults.items[0];
                range.select();
                range.scrollIntoView();
                if (changeType === 'addition') range.font.highlightColor = 'lightGreen';
                else if (changeType === 'deletion') range.font.highlightColor = 'lightPink';
                else range.font.highlightColor = 'yellow';
                await context.sync();
              } else {
                try { console.warn('[UI] document:navigate: no match found after fallbacks', { textLen: searchText.length }); } catch {}
              }
            });
          } catch {}
        };
        window.__ogDocNavigateHandler = handler;
        window.addEventListener('document:navigate', handler);
      }
    } catch {}

    // Web viewer: listen for navigation events and jump to text using SuperDoc
    try {
      if (typeof window !== 'undefined' && typeof Office === 'undefined') {
        window.removeEventListener && window.removeEventListener('document:navigate', window.__ogWebDocNavigateHandler || (()=>{}));
        const webHandler = async (event) => {
          try {
            const detail = event && event.detail ? event.detail : (event && event.payload ? event.payload : {});
            const text = String(detail && (detail.text || ''));
            const changeType = String(detail && (detail.changeType || 'change'));
            const contextBefore = String(detail && (detail.contextBefore || ''));
            const contextAfter = String(detail && (detail.contextAfter || ''));
            const targetVersion = Number(detail && detail.targetVersion ? detail.targetVersion : 0);
            console.log('[UI Web] document:navigate event', { textLen: text.length, changeType, hasCtx: !!(contextBefore || contextAfter) });
            
            if (!text || !window.superdocInstance || !window.superdocInstance.editor) return;
            
            // If a specific version is provided, load it first
            if (Number.isFinite(targetVersion) && targetVersion > 0) {
              try { window.dispatchEvent(new CustomEvent('version:view', { detail: { version: targetVersion } })); } catch {}
              await new Promise(res => setTimeout(res, 900));
            }
            
            const editor = window.superdocInstance.editor;
            const state = editor.view.state;
            const doc = state.doc;
            
            // Normalize text for comparison
            const norm = (s) => String(s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
            const searchText = norm(text);
            const beforeNorm = norm(contextBefore);
            const afterNorm = norm(contextAfter);
            
            let foundPos = null;
            let foundSize = 0;
            
            // Search through document for matching text
            doc.descendants((node, pos) => {
              if (foundPos !== null) return false; // Already found
              if (!node.isText) return;
              
              const nodeText = norm(node.text);
              
              // Try exact match first
              if (nodeText.includes(searchText)) {
                foundPos = pos + nodeText.indexOf(searchText);
                foundSize = text.length;
                return false;
              }
              
              // Try with context
              if (beforeNorm || afterNorm) {
                const contextWindow = norm(`${contextBefore} ${text} ${contextAfter}`);
                if (nodeText.includes(contextWindow)) {
                  foundPos = pos + nodeText.indexOf(searchText);
                  foundSize = text.length;
                  return false;
                }
              }
            });
            
            if (foundPos !== null) {
              // Create selection at found position
              const tr = state.tr;
              const $pos = doc.resolve(foundPos);
              const selection = state.selection.constructor.near($pos);
              tr.setSelection(selection);
              
              // Apply highlighting decoration
              const highlightColor = changeType === 'addition' ? '#c6f6d5' : (changeType === 'deletion' ? '#fed7d7' : '#fef3c7');
              const from = foundPos;
              const to = foundPos + foundSize;
              
              // Dispatch transaction
              editor.view.dispatch(tr.scrollIntoView());
              
              // Add temporary highlight by wrapping in a mark (if marks are available)
              console.log('[UI Web] Found and scrolled to text at position:', foundPos);
              
              // Find the DOM element and add temporary CSS class
              setTimeout(() => {
                try {
                  const domAtPos = editor.view.domAtPos(foundPos);
                  if (domAtPos && domAtPos.node) {
                    let element = domAtPos.node;
                    if (element.nodeType === Node.TEXT_NODE) {
                      element = element.parentElement;
                    }
                    if (element) {
                      element.style.backgroundColor = highlightColor;
                      element.style.transition = 'background-color 2s ease-out';
                      setTimeout(() => {
                        element.style.backgroundColor = '';
                      }, 2000);
                    }
                  }
                } catch (e) {
                  console.warn('[UI Web] Could not highlight text:', e);
                }
              }, 100);
            } else {
              console.warn('[UI Web] document:navigate: no match found', { searchText, textLen: text.length });
            }
          } catch (e) {
            console.error('[UI Web] document:navigate error:', e);
          }
        };
        window.__ogWebDocNavigateHandler = webHandler;
        window.addEventListener('document:navigate', webHandler);
      }
    } catch {}

    // Comparison Tab
    function ComparisonTab() {
      const API_BASE = getApiBase();
      const [versions, setVersions] = React.useState([]);
      const [versionA, setVersionA] = React.useState('1');
      const [versionB, setVersionB] = React.useState('');
      const [list, setList] = React.useState([]);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const [hasCompared, setHasCompared] = React.useState(false);
      
      // Fetch versions list
      const loadVersions = React.useCallback(async () => {
        try {
          const r = await fetch(`${API_BASE}/api/v1/versions?rev=${Date.now()}`, { cache: 'no-store' });
          if (r.ok) {
            const j = await r.json();
            const arr = Array.isArray(j.items) ? j.items : [];
            setVersions(arr);
            // Default to version 1 and latest (only on initial load when nothing is selected)
            if (arr.length > 0 && !versionB) {
              setVersionA('1');
              setVersionB(String(arr.length));
            }
          }
        } catch {}
      }, [API_BASE, versionB]);
      
      React.useEffect(() => {
        loadVersions();
      }, [loadVersions]);
      
      // Listen for versions:update event to refresh list
      React.useEffect(() => {
        const onVersionsUpdate = () => {
          loadVersions();
        };
        window.addEventListener('versions:update', onVersionsUpdate);
        return () => window.removeEventListener('versions:update', onVersionsUpdate);
      }, [loadVersions]);

      const compare = async () => {
        setBusy(true); setError('');
        try {
          console.log('[UI] compare →', { versionA: Number(versionA), versionB: Number(versionB) });
          const r = await fetch(`${API_BASE}/api/v1/versions/compare?debug=true`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versionA: Number(versionA), versionB: Number(versionB) }) });
          if (!r.ok) throw new Error('compare');
          const j = await r.json();
          const diffs = Array.isArray(j.differences) ? j.differences.filter(Boolean) : [];
          if (j && j.debug) console.log('[UI] compare debug ←', j.debug);
          console.log('[UI] compare ←', { count: diffs.length, sample: diffs.slice(0, 3) });
          setList(diffs);
          try {
            const msg = (j && j.message) ? String(j.message) : '';
            if (msg) console.log('[UI] compare info:', msg);
          } catch {}
          setHasCompared(true);
        } catch (e) { console.error('[UI] compare error:', e); setError('Comparison failed'); }
        finally { setBusy(false); }
      };

      const jump = async (diff) => {
        try {
          const body = {
            text: String(diff.text || ''),
            changeType: (diff.type === 1 ? 'addition' : (diff.type === -1 ? 'deletion' : 'change')),
            position: (typeof diff.position === 'number' ? diff.position : undefined),
            contextBefore: String(diff.contextBefore || ''),
            contextAfter: String(diff.contextAfter || ''),
            targetVersion: (typeof diff.targetVersion === 'number' ? diff.targetVersion : undefined)
          };
          console.log('[UI] jump →', body);
          const r = await fetch(`${API_BASE}/api/v1/document/navigate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          const ok = r && r.ok; let j = null; try { j = await r.json(); } catch {}
          console.log('[UI] jump ←', { ok, response: j });
        } catch (e) { console.error('[UI] jump error:', e); }
      };

      const picker = (label, val, setVal) => React.createElement('div', { className: 'd-flex flex-column gap-4', style: { flex: 1 } }, [
        React.createElement('label', { key: 'l', style: { fontSize: '13px', fontWeight: 600, color: '#374151' } }, label),
        React.createElement('select', { 
          key: 's', 
          value: val, 
          onChange: (e) => setVal(e.target.value), 
          style: { 
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '14px',
            color: '#111827',
            backgroundColor: '#ffffff',
            cursor: 'pointer'
          }
        }, versions.slice().reverse().map((v, i) => {
          const versionNum = versions.length - i;
          return React.createElement('option', { key: i, value: String(versionNum) }, `Version ${versionNum}${v.label ? ` - ${v.label}` : ''}`);
        }))
      ]);

      const header = React.createElement('div', { className: 'd-flex flex-column gap-12', style: { padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px' } }, [
        React.createElement('div', { key: 'pickers', className: 'd-flex gap-12' }, [
        picker('Version A', versionA, setVersionA),
          picker('Version B', versionB, setVersionB)
        ]),
        React.createElement('div', { key: 'btn-row', className: 'd-flex' }, [
        React.createElement(UIButton, { key: 'go', label: (busy ? 'Comparing…' : 'Compare'), onClick: compare, disabled: !!busy, variant: 'primary' })
        ])
      ]);

      const isAddin = typeof Office !== 'undefined';
      
      const items = (list || []).map((d, i) => {
        const typeLabel = d.type === 1 ? 'Added' : (d.type === -1 ? 'Removed' : 'Changed');
        const typeColor = d.type === 1 ? '#10b981' : (d.type === -1 ? '#ef4444' : '#f59e0b');
        
        return React.createElement('div', { 
          key: d.id || i, 
          className: 'difference-card', 
          style: { 
            border: '1px solid #e5e7eb', 
            borderRadius: '8px', 
            padding: '12px', 
            backgroundColor: '#ffffff',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
          } 
        }, [
          React.createElement('div', { key: 'h', className: 'd-flex items-center justify-between', style: { marginBottom: '8px' } }, [
            React.createElement('span', { 
              key: 't', 
              style: { 
                fontSize: '13px', 
                fontWeight: 600, 
                color: typeColor,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              } 
            }, typeLabel)
          ]),
          React.createElement('div', { 
            key: 'x', 
            style: { 
              fontSize: '14px', 
              color: '#4b5563', 
              lineHeight: '1.5',
              marginBottom: '12px' // Always show margin for button
            } 
          }, String(d.text || '')),
          React.createElement('div', { key: 'f', className: 'd-flex justify-end' }, 
            React.createElement(UIButton, { label: 'Jump to location', onClick: () => jump(d), variant: 'secondary' })
          )
        ].filter(Boolean));
      });

      const identicalBanner = (hasCompared && (!list || list.length === 0))
        ? React.createElement('div', { 
            style: { 
              padding: '12px 16px', 
              backgroundColor: '#f0fdf4', 
              color: '#166534', 
              border: '1px solid #bbf7d0',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500
            } 
          }, '✓ These versions are identical')
        : null;
      const hasItems = Array.isArray(list) && list.length > 0;

      const errorBanner = error ? React.createElement('div', { 
        style: { 
          padding: '12px 16px', 
          backgroundColor: '#fef2f2', 
          color: '#991b1b', 
          border: '1px solid #fecaca',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 500
        } 
      }, '⚠ ' + error) : null;

      return React.createElement('div', { className: 'd-flex flex-column gap-12' }, [
        header,
        errorBanner,
        identicalBanner,
        (hasItems ? React.createElement('div', { className: 'd-flex flex-column gap-8' }, items) : null)
      ]);
    }

    // Notifications bell (standard icon) that opens a modal
    function NotificationsBell() {
      const { logs, lastSeenLogCount } = React.useContext(StateContext);
      const total = (logs || []).length;
      const unseen = Math.max(0, total - (lastSeenLogCount || 0));
      const open = () => { try { window.dispatchEvent(new CustomEvent('react:open-modal', { detail: { id: 'notifications' } })); } catch {} };
      const badge = unseen ? React.createElement('span', { className: 'ui-badge badge-notification' }, String(unseen)) : null;
      return React.createElement('span', { className: 'notifications-bell', onClick: open, title: 'Notifications' }, ['🔔', badge]);
    }

    function NotificationsModal(props) {
      const { onClose } = props || {};
      const { tokens } = React.useContext(ThemeContext);
      const { logs, markNotificationsSeen, renderNotification } = React.useContext(StateContext);
      const t = tokens && tokens.modal ? tokens.modal : {};

      const copy = async () => {
        try {
          const text = (logs || []).slice().reverse().map(log => {
            if (typeof log === 'string') return log;
            return `[${log.timestamp}] ${log.message}`;
          }).join('\n');
          if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(text);
        } catch {}
      };

      const list = React.createElement('div', {
        className: 'notifications-list notifications-list-modal'
      }, (logs || []).slice().reverse().map((log, index) => renderNotification(log, index)).filter(Boolean));

      const button = (label, variant, onclick) => React.createElement(UIButton, { label, onClick: onclick, variant: variant || 'primary' });
      React.useEffect(() => { try { markNotificationsSeen?.(); } catch {} }, [markNotificationsSeen]);

      return React.createElement('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) onClose?.(); } },
        React.createElement('div', { className: 'modal-panel' }, [
          React.createElement('div', { key: 'h', className: 'ui-modal__header' }, [
            React.createElement('div', { key: 't', className: 'font-bold' }, 'Notifications'),
            React.createElement('button', { key: 'x', className: 'ui-modal__close', onClick: onClose }, '✕')
          ]),
          React.createElement('div', { key: 'b', className: 'ui-modal__body' }, list),
          React.createElement('div', { key: 'f', className: 'modal-footer' }, [
            button('Copy', 'secondary', copy),
            button('Close', 'primary', () => { try { markNotificationsSeen?.(); } finally { onClose?.(); } }),
          ])
        ])
      );
    }


    function ChatConsole() {
      const API_BASE = getApiBase();
      const { currentUser, isConnected, users } = React.useContext(StateContext);
      const DEFAULT_AI_GREETING = 'Shall we...contract?';
      
      // Load messages from server
      const [messages, setMessages] = React.useState(['[bot] ' + DEFAULT_AI_GREETING]);
      
      // Fetch messages on mount and when user changes
      React.useEffect(() => {
        const loadMessages = async () => {
          try {
            const r = await fetch(`${API_BASE}/api/v1/chat?userId=${encodeURIComponent(currentUser)}`);
            if (r.ok) {
              const j = await r.json();
              if (Array.isArray(j.messages) && j.messages.length > 0) {
                setMessages(j.messages);
              } else {
                setMessages(['[bot] ' + DEFAULT_AI_GREETING]);
              }
            }
          } catch {
            setMessages(['[bot] ' + DEFAULT_AI_GREETING]);
          }
        };
        loadMessages();
      }, [API_BASE, currentUser, DEFAULT_AI_GREETING]);
      
      const [text, setText] = React.useState('');
      const listRef = React.useRef(null);
      // Helper function to detect current platform
      const getCurrentPlatform = () => {
        try { return (typeof Office !== 'undefined') ? 'word' : 'web'; } catch { return 'web'; }
      };
      const displayNameOf = React.useCallback((uid) => {
        try {
          if (!uid) return '';
          if (String(uid).toLowerCase() === 'bot') return 'bot';
          const u = (users || []).find(x => x && (x.id === uid || x.label === uid));
          return (u && (u.label || u.id)) || String(uid);
        } catch { return String(uid); }
      }, [users]);

      const send = async () => {
        const t = (text || '').trim();
        if (!t) return;
        setMessages((m) => { const next = (m || []).concat(`[${currentUser}] ${t}`); return next; });
        setText('');
        try {
          const platform = getCurrentPlatform();
          await fetch(`${API_BASE}/api/v1/events/client`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'chat', payload: { text: t }, userId: currentUser, platform }) });
        } catch {}
      };
      React.useEffect(() => {
        function onInboundChat(ev) {
          try {
            const d = ev.detail;
            const text = d && d.payload && d.payload.text;
            const from = d && d.userId || 'bot';
            const threadPlatform = d && d.payload && d.payload.threadPlatform;
            // Ignore messages from other platforms (isolate threads)
            try { if (typeof Office !== 'undefined') { if (threadPlatform && threadPlatform !== 'word') return; } else { if (threadPlatform && threadPlatform !== 'web') return; } } catch {}
            // Ignore echo of our own message (server broadcasts user messages too)
            if (!text || String(from) === String(currentUser)) return;
            setMessages((m) => { const next = (m || []).concat(`[${from}] ${text}`); return next; });
          } catch {}
        }
        function onChatReset(ev) {
          try {
            const d = ev.detail;
            const isGlobal = !!(d && d.payload && d.payload.all);
            const forUser = String(d && d.userId || 'default');
            const threadPlatform = d && d.payload && d.payload.threadPlatform;
            const currentPlatform = typeof Office !== 'undefined' ? 'word' : 'web';
            

            if (isGlobal) {
              // Factory reset: reload from server (should be empty after server reset)
              setMessages(['[bot] ' + DEFAULT_AI_GREETING]);
              setText('');
              // Reload from server
              (async () => {
                try {
                  const r = await fetch(`${API_BASE}/api/v1/chat?userId=${encodeURIComponent(currentUser)}`);
                  if (r.ok) {
                    const j = await r.json();
                    if (Array.isArray(j.messages) && j.messages.length > 0) {
                      setMessages(j.messages);
                    } else {
                      setMessages(['[bot] ' + DEFAULT_AI_GREETING]);
                    }
                  }
                } catch {}
              })();
              return;
            }

            // Ignore resets from other platforms
            try {
              if (typeof Office !== 'undefined') {
                if (threadPlatform && threadPlatform !== 'word') {
                  return;
                }
              } else {
                if (threadPlatform && threadPlatform !== 'web') {
                  return;
                }
              }
            } catch {}

            if (String(forUser) !== String(currentUser)) {
              return;
            }

            // User-initiated reset via reset button
            setMessages(['[bot] ' + DEFAULT_AI_GREETING]);
            setText('');
          } catch (error) {
            console.error('❌ SSE reset error:', error);
          }
        }
        function onChatDelta(ev) {
          try {
            const d = ev.detail;
            const text = String(d && d.payload && d.payload.text || '');
            if (!text) return;

            // Check platform compatibility
            const threadPlatform = d && d.payload && d.payload.threadPlatform;
            try { if (typeof Office !== 'undefined') { if (threadPlatform && threadPlatform !== 'word') return; } else { if (threadPlatform && threadPlatform !== 'web') return; } } catch {}

            // For streaming, we need to handle incremental updates to the last message
            setMessages((m) => {
              const next = [...(m || [])];
              if (next.length === 0 || !next[next.length - 1].startsWith('[bot] ')) {
                // Start new bot message
                next.push('[bot] ' + text);
              } else {
                // Append to existing bot message
                next[next.length - 1] = next[next.length - 1] + text;
              }
              return next;
            });
          } catch {}
        }
        function onChatComplete(ev) {
          try {
            const d = ev.detail;
            const fullText = String(d && d.payload && d.payload.fullText || '');

            // Check platform compatibility
            const threadPlatform = d && d.payload && d.payload.threadPlatform;
            try { if (typeof Office !== 'undefined') { if (threadPlatform && threadPlatform !== 'word') return; } else { if (threadPlatform && threadPlatform !== 'web') return; } } catch {}

            // Replace the last message with the complete text
            setMessages((m) => {
              const next = [...(m || [])];
              if (next.length > 0 && next[next.length - 1].startsWith('[bot] ')) {
                next[next.length - 1] = '[bot] ' + fullText;
              } else {
                next.push('[bot] ' + fullText);
              }
              return next;
            });
          } catch {}
        }
        window.addEventListener('chat:message', onInboundChat);
        window.addEventListener('chat:delta', onChatDelta);
        window.addEventListener('chat:complete', onChatComplete);
        window.addEventListener('chat:reset', onChatReset);
        return () => {
          window.removeEventListener('chat:message', onInboundChat);
          window.removeEventListener('chat:delta', onChatDelta);
          window.removeEventListener('chat:complete', onChatComplete);
          window.removeEventListener('chat:reset', onChatReset);
        };
      }, [currentUser, displayNameOf, API_BASE, DEFAULT_AI_GREETING]);
      const FOOTER_HEIGHT = 140; // reserve space so content never hides behind composer/footer
      const scrollToBottom = React.useCallback(() => {
        try { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; } catch {}
      }, []);
      React.useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);
      const box = React.createElement('div', { className: 'chat-container' }, messages.map((m, i) => {
        const who = (typeof m === 'string' && /^\[/.test(m)) ? (m.match(/^\[([^\]]+)\]/)?.[1] || '') : '';
        const isMine = who && who === currentUser;
        const ts = new Date().toLocaleTimeString();
        const text = typeof m === 'string' ? m.replace(/^\[[^\]]+\]\s*/, '') : String(m);
        const rowCls = 'chat-bubble-row ' + (isMine ? 'mine' : 'other');
        const bubbleCls = 'chat-bubble ' + (isMine ? 'mine' : 'other');
        return React.createElement('div', { key: i, className: rowCls }, [
          React.createElement('div', { key: 'ts', className: 'chat-timestamp ' + (isMine ? 'mine' : 'other') }, ts),
          React.createElement('div', { key: 'b', className: bubbleCls, style: { wordBreak: 'break-word', overflowWrap: 'anywhere' } }, text)
        ]);
      }));
      const onKeyPress = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          send();
        }
      };
      const sendIcon = React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': true },
        React.createElement('path', { d: 'M12 4l0 12', stroke: 'white', 'stroke-width': 2.5, 'stroke-linecap': 'round' }),
        React.createElement('path', { d: 'M7.5 9.5L12 4l4.5 5.5', stroke: 'white', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
      );
      const btn = React.createElement('button', { className: 'btn-circle-primary chat-send', onClick: send, title: 'Send' }, sendIcon);
      const input = React.createElement('div', { className: 'chat-composer' }, [
        React.createElement('textarea', {
          value: text,
          onChange: (e) => setText(e.target.value),
          onKeyPress: onKeyPress,
          placeholder: 'Type a message...',
          className: 'chat-input',
          rows: 2
        }),
        btn
      ]);
      const reset = async () => {
        try {
          
          const plat = (function(){ try { return (typeof Office !== 'undefined') ? 'word' : 'web'; } catch { return 'web'; } })();
          
          const r = await fetch(`${API_BASE}/api/v1/chatbot/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser, platform: plat }) });
          // Ask server and other clients to stop any in-flight streaming
          try { await fetch(`${API_BASE}/api/v1/events/client`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'chat:stop', userId: currentUser, platform: plat }) }); } catch {}
          // Optimistically clear locally; SSE chat:reset will also arrive
          try { setMessages(['[bot] ' + DEFAULT_AI_GREETING]); } catch {}
          try { setText(''); } catch {}
          
          return r;
        } catch (error) {
          console.error('❌ Reset failed:', error);
        } finally {}
      };
      const refreshDoc = async () => {
        try {
          const response = await fetch(`${API_BASE}/api/v1/refresh-document`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          const result = await response.json();
          if (result.ok) {
            setMessages((m) => [...(m || []), `[system] Document context refreshed - ${result.contextLength} chars loaded`]);
          } else {
            setMessages((m) => [...(m || []), `[system] Failed to refresh document: ${result.error}`]);
          }
        } catch (error) {
          setMessages((m) => [...(m || []), `[system] Error refreshing document: ${error.message}`]);
        }
      };
      const resetBtn = React.createElement(UIButton, { label: 'Reset', onClick: reset, tone: 'secondary' });
      const refreshBtn = React.createElement(UIButton, { label: 'Refresh Doc', onClick: refreshDoc, tone: 'secondary' });
      const editPromptBtn = React.createElement(UIButton, { 
        label: 'Edit Prompt', 
        onClick: () => window.dispatchEvent(new CustomEvent('react:open-modal', { 
          detail: { id: 'system-prompt-editor' } 
        })), 
        tone: 'secondary' 
      });
      const isAddin = typeof Office !== 'undefined';
      const footerBar = React.createElement('div', { className: 'd-flex flex-column gap-8', style: { width: '100%', boxSizing: 'border-box', paddingTop: 8, paddingBottom: isAddin ? 8 : 12, paddingLeft: isAddin ? 0 : 12, paddingRight: isAddin ? 0 : 12 } }, [
        React.createElement('div', { className: 'd-flex gap-8 align-items-end', style: { width: '100%', boxSizing: 'border-box' } }, [
          React.createElement('div', { style: { flex: 1 } }, input)
        ]),
        React.createElement('div', { className: 'd-flex gap-8' }, [resetBtn, refreshBtn, editPromptBtn])
      ]);
      const wrap = React.createElement('div', { style: { width: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } }, [
        React.createElement('div', { ref: listRef, style: { flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: isAddin ? '8px' : '12px' } }, [box]),
        React.createElement('div', { style: { flexShrink: 0, background: '#fff', borderTop: '1px solid #e5e7eb' } }, [footerBar])
      ]);
      return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, height: '100%' } }, [wrap]);
    }

    function LastUpdatedPrefix() {
      const { config } = React.useContext(StateContext);
      let dateStr = '';
      let timeStr = '';
      let firstName = '';
      try {
        const ts = config && config.lastSaved && config.lastSaved.timestamp;
        if (ts) {
          const d = new Date(ts);
          // Format: "March 1, 2025"
          dateStr = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          // Format: "1:30pm"
          timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase().replace(/\s/g, '');
        }
        const user = config && config.lastSaved && config.lastSaved.user;
        let label = '';
        if (user) {
          if (typeof user === 'object') label = user.label || user.name || user.id || '';
          else label = String(user);
        }
        label = String(label || '').trim();
        // Only show user name if it is a real human label (not 'system' or 'Unknown User')
        if (label && !/^system$/i.test(label) && !/^unknown\s+user$/i.test(label)) {
          const parts = label.split(/\s+/);
          firstName = parts && parts.length ? parts[0] : '';
        }
      } catch {}
      
      if (!dateStr || !timeStr) return React.createElement('span', null, 'Last updated —');
      const byName = firstName || 'OpenGov';
      return React.createElement('span', null, `Last updated by ${byName} on ${dateStr}, at ${timeStr} PST`);
    }

    function InlineTitleEditor() {
      const { config, addLog, currentUser } = React.useContext(StateContext);
      const API_BASE = getApiBase();
      const [title, setTitle] = React.useState(config?.title || 'Untitled Document');
      React.useEffect(() => { setTitle(config?.title || 'Untitled Document'); }, [config?.title]);
      const onBlur = async () => {
        const next = (title || '').trim();
        if (!next) return;
        try {
          const plat = (function(){ try { return (typeof Office !== 'undefined') ? 'word' : 'web'; } catch { return 'web'; } })();
          const payload = { title: next };
          try { payload.userId = currentUser || undefined; } catch {}
          payload.platform = plat;
          const r = await fetch(`${API_BASE}/api/v1/title`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          if (!r.ok) throw new Error('title_update');
          addLog && addLog('Title updated', 'document');
        } catch {}
      };
      return React.createElement('textarea', {
        value: title,
        onChange: (e) => setTitle(e.target.value),
        onBlur,
        placeholder: 'Wut Contract?',
        className: 'font-semibold w-full document-title document-title-textarea',
        rows: 1
      });
    }

    function StatusBadge() {
      const { config, addLog } = React.useContext(StateContext);
      const API_BASE = getApiBase();
      const [status, setStatus] = React.useState((config?.status || 'draft').toLowerCase());
      React.useEffect(() => { setStatus((config?.status || 'draft').toLowerCase()); }, [config?.status]);
      const cycle = async () => {
        try { const r = await fetch(`${API_BASE}/api/v1/status/cycle`, { method: 'POST' }); if (r.ok) { const j = await r.json(); setStatus((j.status || 'draft').toLowerCase()); addLog && addLog(`Status: ${j.status}`, 'system'); } } catch {}
      };
      const label = (s => s === 'final' ? 'Final' : s === 'review' ? 'Review' : 'Draft')(status);
      const cls = (function(s){
        if (s === 'final') return 'ui-badge gray-verydark';
        if (s === 'review') return 'ui-badge gray-dark';
        return 'ui-badge gray-medium';
      })(status);
      return React.createElement('div', { className: 'mb-2' }, React.createElement('span', { className: cls, onClick: cycle, style: { cursor: 'pointer' } }, label));
    }

    function VersionsPanel() {
      const API_BASE = getApiBase();
      const { config, addLog, viewingVersion, setViewingVersion, setDocumentSource } = React.useContext(StateContext);
      const [items, setItems] = React.useState([]);
      const [confirm, setConfirm] = React.useState(null);
      const refresh = React.useCallback(async () => {
        try {
          const url = `${API_BASE}/api/v1/versions?rev=${Date.now()}`;
          const r = await fetch(url, { cache: 'no-store' });
          if (r.ok) {
            const j = await r.json();
            const arr = Array.isArray(j.items) ? j.items : [];
            setItems(arr);
          }
        } catch {}
      }, [API_BASE]);
      React.useEffect(() => { refresh(); }, [refresh]);
      React.useEffect(() => {
        const onVersionsUpdate = () => { try { refresh(); } catch {} };
        const onFactory = () => { try { setViewingVersion(1); refresh(); } catch {} };
        const onVersionView = async (ev) => {
          try {
            const d = ev && ev.detail;
            const n = Number(d && d.version);
            if (!Number.isFinite(n) || n < 1) return;
            const threadPlatform = d && d.payload && d.payload.threadPlatform;
            
            // Keep platforms separate: ignore view events from the other platform
            try { if (typeof Office !== 'undefined') { if (threadPlatform && threadPlatform !== 'word') return; } else { if (threadPlatform && threadPlatform !== 'web') return; } } catch {}
            // Ensure the list reflects the newest versions
            try { await refresh(); } catch {}
            
            console.log(`[DEBUG] Setting viewingVersion to ${n} - Source: ComparisonTab version:view event`);
            setViewingVersion(n);
            const url = `${API_BASE}/api/v1/versions/${n}?rev=${Date.now()}`;
            if (typeof Office !== 'undefined') {
              try {
                const res = await fetch(url, { cache: 'no-store' }); if (!res.ok) throw new Error('download');
                const buf = await res.arrayBuffer();
                const b64 = (function(buf){ let bin=''; const bytes=new Uint8Array(buf); for(let i=0;i<bytes.byteLength;i++) bin+=String.fromCharCode(bytes[i]); return btoa(bin); })(buf);
                await Word.run(async (context) => { context.document.body.insertFileFromBase64(b64, Word.InsertLocation.replace); await context.sync(); });
              } catch {}
            } else {
              setDocumentSource(url);
              addLog(`doc src versions:view -> ${url}`);
            }
          } catch {}
        };
        try { window.addEventListener('versions:update', onVersionsUpdate); } catch {}
        try { window.addEventListener('factoryReset', onFactory); } catch {}
        try { window.addEventListener('version:view', onVersionView); } catch {}
        return () => {
          try { window.removeEventListener('versions:update', onVersionsUpdate); } catch {}
          try { window.removeEventListener('factoryReset', onFactory); } catch {}
          try { window.removeEventListener('version:view', onVersionView); } catch {}
        };
      }, [API_BASE, addLog, setDocumentSource, setViewingVersion]);
      const isCurrent = (v) => { try { const cur = Number(config?.documentVersion || 1); return Number(v) === cur; } catch { return false; } };
      const isViewing = (v) => { try { return Number(v) === Number(viewingVersion || 0); } catch { return false; } };
        const onClickView = (v) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 1) return;
        setConfirm({ title: 'View this version?', message: `You are about to view version ${n}. Continue?`, onConfirm: async () => {
          try {
            const plat = (function(){ try { return (typeof Office !== 'undefined') ? 'word' : 'web'; } catch { return 'web'; } })();
            await fetch(`${API_BASE}/api/v1/versions/view`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: n, platform: plat }) });
            try { window.dispatchEvent(new CustomEvent('version:view', { detail: { version: n } })); } catch {}
          } catch {}
        } });
      };
      const card = (it, i) => {
        const v = Number(it.version || 1);
        const who = (it.savedBy && (it.savedBy.label || it.savedBy.userId)) || 'Unknown';
        const when = it.savedAt ? new Date(it.savedAt).toLocaleString() : '—';
        const isView = isViewing(v);

        const baseCardStyle = {
          border: `1px solid ${isView ? '#6366F1' : '#E5E7EB'}`,
          borderRadius: 12,
          padding: '14px 16px',
          cursor: 'pointer',
          background: isView ? '#EEF2FF' : '#FFFFFF'
        };

        const titleRow = React.createElement('div', { key: 'title-row', className: 'd-flex items-center', style: { gap: 12 } }, [
          React.createElement('div', { key: 't', style: { fontWeight: 600, fontSize: 16, color: '#111827' } }, `Version ${v}`),
          (isView ? React.createElement('span', { key: 'view', style: { fontSize: 12, color: '#374151', fontWeight: 600 } }, 'Viewing') : null)
        ]);

        const metaRow = React.createElement('div', { key: 'meta', style: { marginTop: 6, fontSize: 14, color: '#6B7280' } }, `${who} at ${when}`);

        return React.createElement('div', { key: `v-${v}-${i}`, onClick: () => onClickView(v), style: baseCardStyle }, [
          titleRow,
          metaRow
        ]);
      };
      const list = (items || []).map(card);
      const inner = list.length
        ? React.createElement('div', { className: 'd-flex flex-column gap-8' }, list)
        : React.createElement('div', { className: 'text-gray-500', style: { padding: 8 } }, 'No versions yet.');
      // Ensure enough bottom padding so the last card isn't hidden beneath the container edge
      const containerStyle = { paddingTop: 3, paddingBottom: 16 };
      return React.createElement('div', { className: 'd-flex flex-column gap-8', style: containerStyle }, [
        inner,
        (confirm ? React.createElement(ConfirmModal, { title: confirm.title, message: confirm.message, onConfirm: confirm.onConfirm, onClose: () => setConfirm(null) }) : null)
      ]);
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
      const select = React.createElement('select', { value: selected || '', onChange }, (users || []).map((u, i) => {
        const name = u.label || u.id;
        const role = String(u.role || 'editor').toLowerCase();
        const optionLabel = name ? `${name} (${role})` : `(${role})`;
        return React.createElement('option', { key: i, value: u.id || u.label }, optionLabel);
      }));
      return React.createElement('div', { className: 'd-flex items-center' }, [select]);
    }

    function DocumentControls() {
      const API_BASE = getApiBase();
      const { revision, setDocumentSource, addLog, setLoadedVersion } = React.useContext(StateContext);
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
          input.onchange = (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; try { setDocumentSource(f); addLog('doc src set [file]'); } catch {} };
          input.click();
        }
      };
      const viewLatest = async () => {
        const w = `${API_BASE}/documents/working/default.docx`;
        const c = `${API_BASE}/documents/canonical/default.docx`;
        if (isWord) {
          try {
            let url = c;
            try {
              const h = await fetch(w, { method: 'HEAD' });
              if (h.ok) {
                const len = Number(h.headers.get('content-length') || '0');
                if (Number.isFinite(len) && len > MIN_DOCX_SIZE) url = w;
              }
            } catch {}
            const withRev = `${url}?rev=${revision || Date.now()}`;
            const res = await fetch(withRev, { cache: 'no-store' }); if (!res.ok) throw new Error('download');
            const buf = await res.arrayBuffer();
            const b64 = (function(buf){ let bin=''; const bytes=new Uint8Array(buf); for(let i=0;i<bytes.byteLength;i++) bin+=String.fromCharCode(bytes[i]); return btoa(bin); })(buf);
            await Word.run(async (context) => { context.document.body.insertFileFromBase64(b64, Word.InsertLocation.replace); await context.sync(); });
            try {
              const plat = 'word';
              const u = `${API_BASE}/api/v1/state-matrix?platform=${plat}&clientVersion=0&userId=${encodeURIComponent('user1')}`;
              const r = await fetch(u);
              const j = await r.json();
              const v = Number(j?.config?.documentVersion || 0);
              if (v > 0) setLoadedVersion(v);
            } catch {}
          } catch {}
        } else {
          try {
            let url = c;
            try {
              const h = await fetch(w, { method: 'HEAD' });
              if (h.ok) {
                const len = Number(h.headers.get('content-length') || '0');
                if (Number.isFinite(len) && len > MIN_DOCX_SIZE) url = w;
              }
            } catch {}
            const finalUrl = `${url}?rev=${revision || Date.now()}`;
            setDocumentSource(finalUrl);
            addLog(`doc src viewLatest -> ${finalUrl}`);
            try {
              const plat = 'web';
              const u = `${API_BASE}/api/v1/state-matrix?platform=${plat}&clientVersion=0&userId=${encodeURIComponent('user1')}`;
              const r = await fetch(u);
              const j = await r.json();
              const v = Number(j?.config?.documentVersion || 0);
              if (v > 0) {
                setLoadedVersion(v);
                try { setViewingVersion(v); } catch {}
                try { window.dispatchEvent(new CustomEvent('version:view', { detail: { version: v, payload: { threadPlatform: plat } } })); } catch {}
              }
            } catch {}
          } catch {}
        }
      };
      const btn = (label, onClick, variant) => React.createElement(UIButton, { label, onClick, variant: variant || 'primary', className: 'w-full' });
      return React.createElement('div', { className: 'd-grid grid-cols-2 column-gap-8 row-gap-6 grid-auto-rows-minmax-27' }, [btn('Open New Document', openNew), btn('View Latest', viewLatest)]);
    }

    function ErrorBanner() {
      const { lastError } = React.useContext(StateContext);
      if (!lastError) return null;
      const msg = lastError.message || 'An error occurred';
      const detail = lastError.url ? ` url=${lastError.url}` : '';
      const status = lastError.status ? ` status=${lastError.status}` : '';
      return React.createElement('div', { className: 'my-2 p-2 border border-error-200 bg-error-50 text-error-700 rounded-md' }, `Error: ${msg}${status}${detail}`);
    }

    function SuperDocHost() {
      const { documentSource, setLastError, addLog } = React.useContext(StateContext);
      const mountedRef = React.useRef(false);
      const inFlightIdRef = React.useRef(0);
      const blobUrlRef = React.useRef(null);
      React.useEffect(() => {
        if (typeof Office !== 'undefined') return; // Word path not here
        if (!documentSource) return;
        (async () => {
          const myId = ++inFlightIdRef.current;
          try {
            const hasBridge = !!(window.SuperDocBridge && typeof window.SuperDocBridge.mount === 'function');
            if (!hasBridge) throw new Error('SuperDocBridge unavailable');
            const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

            async function isValidDocx(blob) {
              try {
                if (!blob || typeof blob.size !== 'number' || blob.size < MIN_DOCX_SIZE) return false;
                const ab = await blob.slice(0, 2).arrayBuffer();
                const u8 = new Uint8Array(ab);
                return u8[0] === 0x50 && u8[1] === 0x4b; // 'PK'
              } catch { return false; }
            }

            async function fetchDocxOrNull(url) {
              try {
                const res = await fetch(url, { cache: 'no-store' });
                if (!res.ok) return null;
                let blob = await res.blob();
                if (blob && blob.type !== MIME_DOCX) {
                  try { blob = new Blob([blob], { type: MIME_DOCX }); } catch {}
                }
                if (!(await isValidDocx(blob))) return null;
                return blob;
              } catch { return null; }
            }

            // Resolve to a valid DOCX Blob/File: try source; if working 404/invalid, try canonical.
            let finalBlob = null;
            let origin = 'file';
            const src = documentSource;
            if (src && (src instanceof Blob || src instanceof File)) {
              finalBlob = src;
              origin = 'file';
            } else if (typeof src === 'string') {
              origin = src.includes('/documents/working/') ? 'working' : (src.includes('/documents/canonical/') ? 'canonical' : 'url');
              finalBlob = await fetchDocxOrNull(src);
              if (!finalBlob && origin === 'working') {
                try {
                  const base = src.split('?')[0].replace('/documents/working/', '/documents/canonical/');
                  const rev = (src.split('rev=')[1] || Date.now()).toString();
                  const fallbackUrl = `${base}?rev=${rev}`;
                  finalBlob = await fetchDocxOrNull(fallbackUrl);
                  if (finalBlob) { origin = 'canonical'; }
                } catch {}
              }
            }

            if (inFlightIdRef.current !== myId) return; // superseded by a newer request

            if (!finalBlob) {
              setLastError({ kind: 'doc_load', message: 'Failed to load document bytes', url: String(documentSource || ''), status: null });
              addLog('doc open ERR invalid_bytes');
              return;
            }

            // Prepare a blob URL for the UMD bridge (expects URL or File/Blob; URL is most reliable)
            try { if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; } } catch {}
            const objectUrl = URL.createObjectURL(finalBlob);
            blobUrlRef.current = objectUrl;
            const docConfigUrl = { id: 'default', type: 'docx', url: objectUrl };
            // const docConfigData = { id: 'default', type: 'docx', data: finalBlob };

            if (!mountedRef.current) {
              // Use open() path which resets containers before mount, mirroring prior working behavior
              if (typeof window.SuperDocBridge.open === 'function') {
                window.SuperDocBridge.open(docConfigUrl);
              } else {
                window.SuperDocBridge.mount({ selector: '#superdoc', toolbar: '#superdoc-toolbar', document: docConfigUrl, documentMode: 'editing' });
              }
              mountedRef.current = true;
              addLog(`doc open [${origin}] url`);
            } else if (typeof window.SuperDocBridge.open === 'function') {
              window.SuperDocBridge.open(docConfigUrl);
              addLog(`doc refresh [${origin}] url`);
            }
          } catch (e) {
            setLastError({ kind: 'doc_load', message: 'Failed to open document', url: String(documentSource || ''), status: null, cause: String(e) });
            try { console.error('doc_load_error', { url: documentSource, error: e }); } catch {}
          }
        })();
        return () => {};
      }, [documentSource]);
      return null;
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

      return React.createElement('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) onClose?.(); } },
        React.createElement('div', { className: 'modal-panel' }, [
          React.createElement('div', { key: 'h', className: 'modal-header' }, [
            React.createElement('div', { key: 't', className: 'font-bold' }, schema.title || 'Modal'),
            React.createElement('button', { key: 'x', className: 'ui-modal__close', onClick: () => onClose?.() }, '✕')
          ]),
          React.createElement('div', { key: 'b', className: 'modal-body' }, [
            schema.description ? React.createElement('div', { key: 'd', className: 'text-gray-500' }, schema.description) : null,
            React.createElement('div', { key: 'f', className: 'd-grid grid-cols-1 gap-12' },
              (Array.isArray(schema.fields) ? schema.fields : []).map((f, i) => React.createElement('div', { key: `r-${i}`, className: 'd-flex flex-column gap-6' }, [
                React.createElement('label', { key: 'l', className: 'text-sm text-gray-500' }, f.label || f.name),
                (f.type === 'textarea'
                  ? React.createElement('textarea', { key: 'i', rows: 4, placeholder: f.placeholder || '', defaultValue: f.value || '', maxLength: f.maxLength || undefined, className: 'input-padding input-border input-border-radius', onChange: (e) => setField(f.name, e.target.value) })
                  : React.createElement('input', { key: 'i', type: 'text', placeholder: f.placeholder || '', defaultValue: f.value || '', className: 'input-padding input-border input-border-radius', onChange: (e) => setField(f.name, e.target.value) })
                )
              ]))
            )
          ]),
          React.createElement('div', { key: 'f2', className: 'modal-footer' },
            (Array.isArray(schema.actions) ? schema.actions : []).map((a, i) => React.createElement(UIButton, { key: `a-${i}`, label: a.label || a.id, onClick: () => onAction(a.id), variant: a.variant || 'primary' }))
          )
        ])
      );
    }

    function MessageModal(props) {
      const { onClose, toUserId, toUserName } = props || {};
      const API_BASE = getApiBase();
      const { currentUser } = React.useContext(StateContext);
      const [text, setText] = React.useState('');
      const [busy, setBusy] = React.useState(false);
      const send = async () => {
        setBusy(true);
        try {
          await fetch(`${API_BASE}/api/v1/events/client`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'approvals:message', payload: { to: toUserId, text }, userId: currentUser }) });
        } catch {}
        finally { setBusy(false); onClose?.(); }
      };
      return React.createElement('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) onClose?.(); } },
        React.createElement('div', { className: 'modal-panel' }, [
          React.createElement('div', { key: 'h', className: 'modal-header' }, [
            React.createElement('div', { key: 't', className: 'font-bold' }, 'Message'),
            React.createElement('button', { key: 'x', className: 'ui-modal__close', onClick: onClose }, '✕')
          ]),
          React.createElement('div', { key: 'b', className: 'modal-body' }, [
            React.createElement('div', { key: 'to', className: 'text-sm text-gray-500' }, `To: ${toUserName || toUserId}`),
            React.createElement('textarea', { key: 'm', rows: 4, placeholder: 'Write a message…', value: text, onChange: (e) => setText(e.target.value), className: 'input-padding input-border input-border-radius' })
          ]),
          React.createElement('div', { key: 'f', className: 'modal-footer' }, [
            React.createElement(UIButton, { key: 'cancel', label: 'Cancel', onClick: onClose, disabled: !!busy }),
            React.createElement(UIButton, { key: 'send', label: 'Send', onClick: send, variant: 'primary', disabled: !!busy })
          ])
        ])
      );
    }

    function RequestReviewModal(props) {
      const { onClose } = props || {};
      const API_BASE = getApiBase();
      const { currentUser } = React.useContext(StateContext);
      const [busy, setBusy] = React.useState(false);
      const notify = async () => {
        setBusy(true);
        try { await fetch(`${API_BASE}/api/v1/approvals/notify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: 'default', actorUserId: currentUser }) }); } catch {}
        finally { setBusy(false); onClose?.(); }
      };
      return React.createElement('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) onClose?.(); } },
        React.createElement('div', { className: 'modal-panel' }, [
          React.createElement('div', { key: 'h', className: 'modal-header' }, [
            React.createElement('div', { key: 't', className: 'font-bold' }, 'Request review'),
            React.createElement('button', { key: 'x', className: 'ui-modal__close', onClick: onClose }, '✕')
          ]),
          React.createElement('div', { key: 'b', className: 'modal-body' }, 'Notify approvers that the document is ready for review?'),
          React.createElement('div', { key: 'f', className: 'modal-footer' }, [
            React.createElement(UIButton, { key: 'cancel', label: 'Cancel', onClick: onClose, disabled: !!busy }),
            React.createElement(UIButton, { key: 'notify', label: 'Notify', onClick: notify, variant: 'primary', disabled: !!busy })
          ])
        ])
      );
    }

    function CompileModal(props) {
      const { onClose } = props || {};
      const API_BASE = getApiBase();
      const [items, setItems] = React.useState([]);
      const [selected, setSelected] = React.useState(new Set());
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const [resultUrl, setResultUrl] = React.useState('');
      React.useEffect(() => { (async () => { try { const r = await fetch(`${API_BASE}/api/v1/exhibits`); if (r.ok) { const j = await r.json(); setItems(Array.isArray(j.items) ? j.items.filter(it=>/\.pdf$/i.test(it.name)) : []); } } catch {} })(); }, [API_BASE]);
      const toggle = (name) => setSelected(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
      const refresh = async () => { try { const r = await fetch(`${API_BASE}/api/v1/exhibits`); if (r.ok) { const j = await r.json(); setItems(Array.isArray(j.items) ? j.items.filter(it=>/\.pdf$/i.test(it.name)) : []); } } catch {} };
      const upload = () => {
        try {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'application/pdf,.pdf';
          input.onchange = async (e) => {
            const file = e.target.files && e.target.files[0]; if (!file) return;
            const fd = new FormData();
            fd.append('file', file, file.name);
            setBusy(true); setError('');
            try {
              const r = await fetch(`${API_BASE}/api/v1/exhibits/upload`, { method: 'POST', body: fd });
              if (!r.ok) throw new Error('upload');
              await refresh();
            } catch { setError('Failed to upload'); }
            finally { setBusy(false); }
          };
          input.click();
        } catch {}
      };
      const compile = async () => {
        setBusy(true); setError(''); setResultUrl('');
        try {
          const exhibits = Array.from(selected.values());
          const r = await fetch(`${API_BASE}/api/v1/compile`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exhibits }) });
          if (!r.ok) throw new Error('compile');
          const j = await r.json();
          if (j && j.url) setResultUrl(j.url);
        } catch { setError('Failed to compile'); }
        finally { setBusy(false); }
      };
      React.useEffect(() => {
        if (!resultUrl) return;
        try {
          const href = (/^https?:/i.test(resultUrl)) ? resultUrl : `${API_BASE}${resultUrl.startsWith('/') ? resultUrl : ('/' + resultUrl)}`;
          const a = document.createElement('a');
          a.href = href;
          a.download = 'packet.pdf';
          a.target = '_blank';
          a.rel = 'noopener';
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { try { document.body.removeChild(a); } catch {} }, 0);
        } catch {}
      }, [resultUrl, API_BASE]);
      return React.createElement('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) onClose?.(); } },
        React.createElement('div', { className: 'modal-panel' }, [
          React.createElement('div', { key: 'h', className: 'modal-header' }, [
            React.createElement('div', { key: 't', className: 'font-bold' }, 'Compile'),
            React.createElement('button', { key: 'x', className: 'ui-modal__close', onClick: onClose }, '✕')
          ]),
          error ? React.createElement('div', { key: 'e', className: 'bg-error-50 text-error-700 p-2 border-t border-b border-error-200' }, error) : null,
          React.createElement('div', { key: 'b', className: 'modal-body d-flex flex-column gap-12' }, [
            React.createElement('div', { key: 'lbl', className: 'font-semibold' }, 'Exhibits'),
            React.createElement('div', { key: 'list', className: 'border border-gray-200 rounded-md p-2 overflow-auto max-h-50' },
              (items.length ? items.map((it, i) => React.createElement('label', { key: i, className: 'd-flex items-center gap-2 p-1' }, [
                React.createElement('input', { type: 'checkbox', checked: selected.has(it.name), onChange: () => toggle(it.name) }),
                React.createElement('span', null, it.name)
              ])) : React.createElement('div', null, '(none)'))
            ),
            resultUrl ? React.createElement('div', { key: 'ok' }, [
              React.createElement('a', { href: resultUrl, target: '_blank', rel: 'noreferrer' }, 'Open compiled PDF')
            ]) : null
          ]),
          React.createElement('div', { key: 'f', className: 'modal-footer' }, [
            React.createElement(UIButton, { key: 'upload', label: 'Upload PDF', onClick: upload, disabled: !!busy }),
            React.createElement(UIButton, { key: 'cancel', label: 'Cancel', onClick: onClose, disabled: !!busy }),
            React.createElement(UIButton, { key: 'go', label: 'Compile', onClick: compile, variant: 'primary', isLoading: !!busy, loadingLabel: 'Compiling…' }),
          ])
        ])
      );
    }

    function OpenGovModal(props) {
      const { onClose } = props || {};
      const { tokens } = React.useContext(ThemeContext);
      const t = tokens && tokens.modal ? tokens.modal : {};
      const ratioWrap = { position: 'relative', paddingTop: '56.25%', borderRadius: '8px', overflow: 'hidden' };
      const ratioInner = { position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 };
      // Remove iframe on close to stop playback: unmounting this component achieves that.
      return React.createElement('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) onClose?.(); } },
        React.createElement('div', { className: 'modal-panel' }, [
          React.createElement('div', { key: 'h', className: 'modal-header' }, [
            React.createElement('div', { key: 't', className: 'font-bold' }, `We're not going back. We're going forward!`),
            React.createElement('button', { key: 'x', className: 'ui-modal__close', onClick: onClose }, '✕')
          ]),
          React.createElement('div', { key: 'b', className: 'modal-body' },
            React.createElement('div', { style: ratioWrap },
              React.createElement('iframe', { style: ratioInner, src: 'https://www.youtube.com/embed/oHg5SJYRHA0?autoplay=1&rel=0&modestbranding=1', title: 'Back to OpenGov', allow: 'autoplay; encrypted-media', allowFullScreen: true })
            )
          )
        ])
      );
    }

    function VersionOutdatedCheckoutModal(props) {
      const { onClose, currentVersion, clientVersion, viewingVersion, message, userId } = props || {};
      const { tokens } = React.useContext(ThemeContext);
      const { actions, addLog, refresh, setViewingVersion, setLoadedVersion } = React.useContext(StateContext);
      const t = tokens && tokens.modal ? tokens.modal : {};
      
      const handleCheckoutLatest = async () => {
        
        try {
          const response = await fetch(`${getApiBase()}/api/v1/checkout`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ userId, clientVersion: currentVersion, forceCheckout: true }) 
          });
          
          
          
          if (response.ok) {
            addLog('Document checked out successfully (latest version)', 'success'); 
            try { 
              await refresh(); 
              console.log(`[DEBUG] Setting viewingVersion to ${currentVersion} - Source: checkout (current version)`);
              try { if (typeof setViewingVersion === 'function') setViewingVersion(currentVersion); } catch {}
              try { if (typeof setLoadedVersion === 'function') setLoadedVersion(currentVersion); } catch {}
              try {
                const plat = (function(){ try { return (typeof Office !== 'undefined') ? 'word' : 'web'; } catch { return 'web'; } })();
                window.dispatchEvent(new CustomEvent('version:view', { detail: { version: currentVersion, payload: { threadPlatform: plat } } }));
              } catch {}
            } finally { onClose?.(); }
          } else {
            const errorData = await response.json();
            
            addLog(`Failed to check out document: ${errorData.error || 'Unknown error'}`, 'error');
          }
        } catch (e) { 
          console.error('handleCheckoutLatest exception:', e);
          addLog(`Failed to check out document: ${e?.message||e}`, 'error'); 
        }
      };

      const handleCheckoutCurrent = async () => {
        const versionToUse = viewingVersion || clientVersion;
        
        try {
          const response = await fetch(`${getApiBase()}/api/v1/checkout`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ userId, clientVersion: versionToUse, forceCheckout: true }) 
          });
          
          
          
          if (response.ok) {
            addLog(`Document checked out successfully (version ${versionToUse})`, 'success'); 
            try { 
              await refresh(); 
              console.log(`[DEBUG] Setting viewingVersion to ${versionToUse} - Source: checkout (specific version)`);
              try { if (typeof setViewingVersion === 'function') setViewingVersion(versionToUse); } catch {}
              try { if (typeof setLoadedVersion === 'function') setLoadedVersion(versionToUse); } catch {}
              try {
                const plat = (function(){ try { return (typeof Office !== 'undefined') ? 'word' : 'web'; } catch { return 'web'; } })();
                window.dispatchEvent(new CustomEvent('version:view', { detail: { version: versionToUse, payload: { threadPlatform: plat } } }));
              } catch {}
            } finally { onClose?.(); }
          } else {
            const errorData = await response.json();
            
            addLog(`Failed to check out document: ${errorData.error || 'Unknown error'}`, 'error');
          }
        } catch (e) { 
          console.error('handleCheckoutCurrent exception:', e);
          addLog(`Failed to check out document: ${e?.message||e}`, 'error'); 
        }
      };

      const btn = (label, variant, onclick) => React.createElement(UIButton, { label, onClick: onclick, variant: variant || 'primary' });

      return React.createElement('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) onClose?.(); } },
        React.createElement('div', { className: 'modal-panel' }, [
          React.createElement('div', { key: 'h', className: 'modal-header' }, [
            React.createElement('div', { key: 't', className: 'font-bold' }, 'Document Updated'),
            React.createElement('button', { key: 'x', className: 'ui-modal__close', onClick: onClose }, '✕')
          ]),
          React.createElement('div', { key: 'b', className: 'modal-body' }, [
            React.createElement('p', { key: 'msg', style: { marginBottom: '16px' } }, 'Document has been updated. Which version would you like to check out?'),
            React.createElement('div', { key: 'info', style: { marginBottom: '20px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px' } }, [
              React.createElement('div', { key: 'current', style: { marginBottom: '4px' } }, `Latest version: ${currentVersion || 'Unknown'}`),
              React.createElement('div', { key: 'viewing' }, `You're viewing version: ${viewingVersion || clientVersion || 'Unknown'}`)
            ])
          ]),
          React.createElement('div', { key: 'f', className: 'modal-footer' }, [
            btn('Cancel', 'tertiary', onClose),
            btn(`Check Out Version ${viewingVersion || clientVersion}`, 'secondary', handleCheckoutCurrent),
            btn('Check Out Latest Version', 'primary', handleCheckoutLatest)
          ])
        ])
      );
    }

    function ConfirmModal(props) {
      const { title, message, onConfirm, onClose } = props || {};
      const { tokens } = React.useContext(ThemeContext);
      const t = tokens && tokens.modal ? tokens.modal : {};
      const btn = (label, variant, onclick) => React.createElement(UIButton, { label, onClick: onclick, variant: variant || 'primary' });
      return React.createElement('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) onClose?.(); } },
        React.createElement('div', { className: 'modal-panel' }, [
          React.createElement('div', { key: 'h', className: 'modal-header' }, [
            React.createElement('div', { key: 't', className: 'font-bold' }, title || 'Confirm'),
            React.createElement('button', { key: 'x', className: 'ui-modal__close', onClick: onClose }, '✕')
          ]),
          React.createElement('div', { key: 'b', className: 'modal-body' }, message || ''),
          React.createElement('div', { key: 'f', className: 'modal-footer' }, [
            btn('Cancel', 'secondary', onClose),
            btn('Confirm', 'primary', async () => { try { await onConfirm?.(); } finally { onClose?.(); } }),
          ])
        ])
      );
    }

    function SystemPromptEditorModal(props) {
      const { onClose } = props || {};
      const [prompt, setPrompt] = React.useState('');
      const [loading, setLoading] = React.useState(true);
      const [saving, setSaving] = React.useState(false);
      const [error, setError] = React.useState('');
      const [contextPreview, setContextPreview] = React.useState('');
      
      React.useEffect(() => {
        const API_BASE = getApiBase();
        (async () => {
          try {
            const r = await fetch(`${API_BASE}/api/v1/chat/system-prompt`);
            if (r.ok) {
              const data = await r.json();
              setPrompt(data.prompt || '');
              setContextPreview(data.documentContextPreview || '');
            } else {
              setError('Failed to load system prompt');
            }
          } catch (e) {
            setError('Error loading system prompt: ' + e.message);
          }
          setLoading(false);
        })();
      }, []);
      
      const save = async () => {
        if (prompt.trim().length < 10) {
          setError('Prompt must be at least 10 characters');
          return;
        }
        if (prompt.length > 2000) {
          setError('Prompt is too long (max 2000 characters)');
          return;
        }
        
        setSaving(true);
        setError('');
        try {
          const API_BASE = getApiBase();
          const r = await fetch(`${API_BASE}/api/v1/chat/system-prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
          });
          if (r.ok) {
            onClose?.();
          } else {
            const data = await r.json();
            setError(data.error || 'Failed to save prompt');
          }
        } catch (e) {
          setError('Error saving prompt: ' + e.message);
        }
        setSaving(false);
      };
      
      const resetToDefault = async () => {
        if (!confirm('Reset to default prompt? This will delete your custom prompt.')) return;
        
        setSaving(true);
        setError('');
        try {
          const API_BASE = getApiBase();
          const r = await fetch(`${API_BASE}/api/v1/chat/system-prompt/reset`, {
            method: 'POST'
          });
          if (r.ok) {
            // Reload prompt
            const r2 = await fetch(`${API_BASE}/api/v1/chat/system-prompt`);
            if (r2.ok) {
              const data = await r2.json();
              setPrompt(data.prompt || '');
            }
          } else {
            setError('Failed to reset prompt');
          }
        } catch (e) {
          setError('Error resetting prompt: ' + e.message);
        }
        setSaving(false);
      };
      
      const btn = (label, variant, onclick, disabled) => React.createElement(UIButton, { label, onClick: onclick, variant: variant || 'primary', disabled });
      
      return React.createElement('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) onClose?.(); } },
        React.createElement('div', { className: 'modal-panel', style: { maxWidth: '700px', width: '90%' } }, [
          React.createElement('div', { key: 'h', className: 'modal-header' }, [
            React.createElement('div', { key: 't', className: 'font-bold' }, 'AI System Prompt'),
            React.createElement('button', { key: 'x', className: 'ui-modal__close', onClick: onClose }, '✕')
          ]),
          React.createElement('div', { key: 'b', className: 'modal-body d-flex flex-column gap-16' }, [
            loading ? React.createElement('div', { key: 'loading' }, 'Loading...') : null,
            !loading ? React.createElement('div', { key: 'info', className: 'text-sm text-gray-500 p-3 bg-gray-50 rounded border border-gray-200' }, [
              React.createElement('div', { key: 'label', className: 'font-semibold mb-1' }, 'How it works:'),
              React.createElement('div', { key: 'text' }, 'The {DOCUMENT_CONTEXT} placeholder will be automatically replaced with the current document content. This prompt guides how the AI responds to your questions.')
            ]) : null,
            !loading && contextPreview ? React.createElement('div', { key: 'preview', className: 'd-flex flex-column gap-4' }, [
              React.createElement('label', { key: 'label', className: 'text-sm font-semibold' }, 'Current Document Context (preview):'),
              React.createElement('div', { key: 'text', className: 'p-2 bg-gray-50 rounded border border-gray-200 text-xs text-gray-500', style: { fontFamily: 'monospace', maxHeight: '80px', overflow: 'auto' } }, contextPreview)
            ]) : null,
            !loading ? React.createElement('div', { key: 'prompt', className: 'd-flex flex-column gap-6' }, [
              React.createElement('label', { key: 'label', className: 'text-sm font-semibold' }, 'System Prompt:'),
              React.createElement('textarea', {
                key: 'textarea',
                rows: 10,
                value: prompt,
                onChange: (e) => setPrompt(e.target.value),
                placeholder: 'Enter system prompt...',
                className: 'input-padding input-border input-border-radius',
                style: { resize: 'vertical' }
              }),
              React.createElement('div', { key: 'count', className: 'text-xs text-gray-500 text-right' }, `${prompt.length} / 2000 characters`)
            ]) : null,
            error ? React.createElement('div', { key: 'error', className: 'text-sm text-red-600 p-2 bg-red-50 rounded border border-red-200' }, error) : null
          ]),
          React.createElement('div', { key: 'f', className: 'modal-footer d-flex justify-between' }, [
            React.createElement('div', { key: 'left' }, btn('Reset to Default', 'secondary', resetToDefault, saving || loading)),
            React.createElement('div', { key: 'right', className: 'd-flex gap-8' }, [
              btn('Cancel', 'secondary', onClose, saving),
              btn('Save', 'primary', save, saving || loading)
            ])
          ])
        ])
      );
    }

    function ApprovalsPill() {
      const { approvalsSummary } = React.useContext(StateContext);
      if (!approvalsSummary) return null;
      const text = `${approvalsSummary.approved || 0}/${approvalsSummary.total || 0} approved`;
      const open = () => { try { setTimeout(() => { try { window.dispatchEvent(new CustomEvent('react:open-modal', { detail: { id: 'approvals' } })); } catch {} }, 200); } catch {} };
      return React.createElement('button', { className: 'approvals-pill mb-3', onClick: open, title: 'Approvals', type: 'button' }, text);
    }

    function ApprovalsModal(props) {
      const { onClose } = props || {};
      const { currentUser, currentRole, approvalsRevision } = React.useContext(StateContext);
      const API_BASE = getApiBase();
      const [rows, setRows] = React.useState(null);
      const [hdr, setHdr] = React.useState({ approved: 0, total: 0 });
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const [prompt, setPrompt] = React.useState(null);
      const load = React.useCallback(async () => {
        try {
          const r = await fetch(`${API_BASE}/api/v1/approvals`);
          if (!r.ok) throw new Error('load');
          const j = await r.json();
          setRows(Array.isArray(j.approvers) ? j.approvers : []);
          setHdr(j.summary || { approved: 0, total: 0 });
        } catch { setError('Failed to load approvals'); }
      }, [API_BASE]);
      React.useEffect(() => { load(); }, [load]);
      React.useEffect(() => { if (approvalsRevision) load(); }, [approvalsRevision, load]);
      const setSelf = async (targetUserId, approved, notes) => {
        setBusy(true); setError('');
        try {
          const body = { documentId: 'default', actorUserId: currentUser, targetUserId, approved: !!approved };
          if (notes !== undefined) body.notes = String(notes);
          const r = await fetch(`${API_BASE}/api/v1/approvals/set`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          if (!r.ok) throw new Error('set');
          const j = await r.json();
          setRows(Array.isArray(j.approvers) ? j.approvers : []);
          setHdr(j.summary || { approved: 0, total: 0 });
        } catch { setError('Failed to update'); }
        finally { setBusy(false); }
      };
      const doNotify = async () => {
        setBusy(true); setError('');
        try {
          const r = await fetch(`${API_BASE}/api/v1/approvals/notify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: 'default', actorUserId: currentUser }) });
          if (!r.ok) throw new Error('notify');
        } catch { setError('Failed to notify'); }
        finally { setBusy(false); }
      };
      const confirmReset = () => {
        setPrompt({ title: 'Factory reset?', message: 'Reset approvals and working overlays?', onConfirm: async () => {
          setBusy(true); setError('');
          try {
            const r = await fetch(`${API_BASE}/api/v1/factory-reset`, { method: 'POST' });
            if (!r.ok) throw new Error('reset');
            await load();
          } catch { setError('Failed to reset'); }
          finally { setBusy(false); }
        }});
      };
      const btn = (label, onClick, variant) => React.createElement(UIButton, { label, onClick, variant: variant || 'primary' });
      const canOverride = (String(currentRole || '').toLowerCase() === 'editor');
      const canToggle = (row) => canOverride || String(row.userId) === String(currentUser);
      const onToggle = async (row, next) => {
        if (!canToggle(row)) return; // Non-editors cannot toggle others
        if (row.userId !== currentUser && canOverride) {
          setPrompt({ title: 'Override approval?', message: `Override approval for ${row.name}?`, onConfirm: async () => { await setSelf(row.userId, next); } });
          return;
        }
        await setSelf(row.userId, next);
      };
      return React.createElement('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) onClose?.(); } },
        React.createElement('div', { className: 'modal-panel' }, [
          React.createElement('div', { key: 'h', className: 'modal-header' }, [
            React.createElement('div', { key: 't', className: 'font-bold' }, `Approvals (${hdr.approved}/${hdr.total} approved)`),
            React.createElement('div', { key: 'tb' }, [
              btn('Refresh', load),
              btn('Factory reset', confirmReset),
              btn('Close', onClose),
            ])
          ]),
          error ? React.createElement('div', { key: 'e', className: 'bg-error-50 text-error-700 p-3 border-t border-b border-error-200' }, error) : null,
          React.createElement('div', { key: 'b', className: 'modal-body p-3' }, [
            !rows ? React.createElement('div', null, 'Loading...') :
              React.createElement('table', { className: 'w-full table-collapse' }, [
                React.createElement('thead', { key: 'th' }, React.createElement('tr', null, [
                  React.createElement('th', { key: 'o', className: 'text-left table-cell-padding' }, '#'),
                  React.createElement('th', { key: 'n', className: 'text-left table-cell-padding' }, 'Human'),
                  React.createElement('th', { key: 'a', className: 'text-left table-cell-padding' }, 'Approved'),
                  React.createElement('th', { key: 'm', className: 'text-left table-cell-padding' }, 'Message'),
                  React.createElement('th', { key: 't', className: 'text-left table-cell-padding' }, 'Notes'),
                ])),
                React.createElement('tbody', { key: 'tb' }, (rows||[]).map((r, i) => React.createElement('tr', { key: r.userId || i, className: 'border-t border-gray-200' }, [
                  React.createElement('td', { key: 'o', className: 'table-cell-padding' }, String(r.order || i+1)),
                  React.createElement('td', { key: 'n', className: 'table-cell-padding' }, r.name || r.userId),
                  React.createElement('td', { key: 'a', className: 'table-cell-padding' }, React.createElement('input', { type: 'checkbox', disabled: (!!busy) || (!canToggle(r)), checked: !!r.approved, title: (!canToggle(r) ? 'Only editors can override others' : undefined), onChange: (e) => onToggle(r, !!e.target.checked) })),
                  React.createElement('td', { key: 'm', className: 'table-cell-padding' }, React.createElement(UIButton, { label: 'Message', onClick: () => { try { window.dispatchEvent(new CustomEvent('react:open-modal', { detail: { id: 'message', options: { toUserId: r.userId, toUserName: r.name || r.userId } } })); } catch {} } })),
                  React.createElement('td', { key: 't', className: 'table-cell-padding' }, React.createElement('input', { type: 'text', defaultValue: r.notes || '', onBlur: (e) => setSelf(r.userId, r.approved, e.target.value), className: 'w-full' })),
                ])))
              ])
          ]),
          prompt ? React.createElement(ConfirmModal, { title: prompt.title, message: prompt.message, onConfirm: async () => { try { await prompt.onConfirm?.(); } finally { setPrompt(null); } }, onClose: () => setPrompt(null) }) : null,
        ])
      );
    }

    // Inline Workflow approvals panel (reuses modal logic)
    function WorkflowApprovalsPanel() {
      const { currentUser, currentRole, approvalsRevision, users } = React.useContext(StateContext);
      const API_BASE = getApiBase();
      const [rows, setRows] = React.useState(null);
      const [hdr, setHdr] = React.useState({ approved: 0, total: 0 });
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const [prompt, setPrompt] = React.useState(null);
      const load = React.useCallback(async () => {
        try {
          const r = await fetch(`${API_BASE}/api/v1/approvals`);
          if (!r.ok) throw new Error('load');
          const j = await r.json();
          setRows(Array.isArray(j.approvers) ? j.approvers : []);
          setHdr(j.summary || { approved: 0, total: 0 });
        } catch { setError('Failed to load approvals'); }
      }, [API_BASE]);
      React.useEffect(() => { load(); }, [load]);
      React.useEffect(() => { if (approvalsRevision) load(); }, [approvalsRevision, load]);

      const roleOf = (uid) => {
        try { const u = (users || []).find(x => (x && (x.id === uid || x.label === uid))); return (u && (u.role || 'editor')) || 'editor'; } catch { return 'editor'; }
      };
      const titleOf = (uid) => {
        try { const u = (users || []).find(x => (x && (x.id === uid || x.label === uid))); return (u && (u.title || '')) || ''; } catch { return ''; }
      };
      const initialsOf = (label) => {
        try {
          const parts = String(label || '').trim().split(/\s+/).filter(Boolean);
          if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
          if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
          return '';
        } catch { return ''; }
      };

      const canOverride = (String(currentRole || '').toLowerCase() === 'editor');
      const canToggle = (row) => canOverride || String(row.userId) === String(currentUser);
      const setSelf = async (targetUserId, approved, notes) => {
        setBusy(true); setError('');
        try {
          const body = { documentId: 'default', actorUserId: currentUser, targetUserId, approved: !!approved };
          if (notes !== undefined) body.notes = String(notes);
          const r = await fetch(`${API_BASE}/api/v1/approvals/set`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          if (!r.ok) throw new Error('set');
          const j = await r.json();
          setRows(Array.isArray(j.approvers) ? j.approvers : []);
          setHdr(j.summary || { approved: 0, total: 0 });
        } catch { setError('Failed to update'); }
        finally { setBusy(false); }
      };

      const onToggle = async (row, next) => {
        if (!canToggle(row)) return;
        if (row.userId !== currentUser && canOverride) {
          setPrompt({ title: 'Override approval?', message: `Override approval for ${row.name}?`, onConfirm: async () => { await setSelf(row.userId, next); } });
          return;
        }
        await setSelf(row.userId, next);
      };

      const notify = async () => {
        setBusy(true); setError('');
        try {
          const r = await fetch(`${API_BASE}/api/v1/approvals/notify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: 'default', actorUserId: currentUser }) });
          if (!r.ok) throw new Error('notify');
        } catch { setError('Failed to notify'); }
        finally { setBusy(false); }
      };

      const header = null;

      const list = !rows ? React.createElement('div', null, 'Loading...') : React.createElement('div', { className: 'd-flex flex-column gap-8' },
        rows.map((r, i) => React.createElement('div', { key: r.userId || i, className: 'workflow-card d-flex items-center justify-between' }, [
          React.createElement('div', { key: 'lwrap', className: 'd-flex items-center' }, [
            React.createElement('div', { key: 'av', className: 'avatar-initials', style: { marginRight: 10 } }, initialsOf(r.name || r.userId)),
            React.createElement('div', { key: 'txt', className: 'd-flex flex-column' }, [
              React.createElement('div', { key: 'n', className: 'font-medium' }, r.name || r.userId),
              React.createElement('div', { key: 'tr', className: 'text-sm text-gray-600' }, [titleOf(r.userId), titleOf(r.userId) ? ' • ' : '', (roleOf(r.userId) || '').toString()])
            ])
          ]),
          React.createElement('input', { key: 'c', type: 'checkbox', disabled: (!!busy) || (!canToggle(r)), checked: !!r.approved, onChange: (e) => onToggle(r, !!e.target.checked), title: (!canToggle(r) ? 'Only editors can override others' : undefined) })
        ]))
      );

      return React.createElement('div', null, [
        error ? React.createElement('div', { className: 'bg-error-50 text-error-700 p-2 mb-2 border border-error-200 rounded' }, error) : null,
        header,
        list,
        (prompt ? React.createElement(ConfirmModal, { title: prompt.title, message: prompt.message, onConfirm: async () => { try { await prompt.onConfirm?.(); } finally { setPrompt(null); } }, onClose: () => setPrompt(null) }) : null)
      ]);
    }

    // Variables Panel - Phase 3: Full implementation with inline value editing
    function VariablesPanel() {
      const API_BASE = getApiBase();
      const { currentUser } = React.useContext(StateContext);
      const [showModal, setShowModal] = React.useState(false);
      const [variableName, setVariableName] = React.useState('');
      const [variableType, setVariableType] = React.useState('value');
      const [variableEmail, setVariableEmail] = React.useState('');
      const [isCreating, setIsCreating] = React.useState(false);
      const [variables, setVariables] = React.useState({});
      const [isLoading, setIsLoading] = React.useState(true);
      const [editingValues, setEditingValues] = React.useState({});
      const [editingNames, setEditingNames] = React.useState({});
      const [filterType, setFilterType] = React.useState('all'); // 'all', 'value', 'signature'
      const saveTimeouts = React.useRef({});

      // Helper: Get variable colors from CSS variables
      const getVariableColors = () => {
        try {
          const styles = getComputedStyle(document.documentElement);
          return {
            borderColor: styles.getPropertyValue('--variable-border-color').trim() || '#0E6F7F',
            highlightColor: styles.getPropertyValue('--variable-highlight-color').trim() || '#F1FAFC'
          };
        } catch (error) {
          // Fallback to hardcoded values if CSS variables aren't available
          return {
            borderColor: '#0E6F7F',
            highlightColor: '#F1FAFC'
          };
        }
      };

      // Load variables from backend
      React.useEffect(() => {
        const loadVariables = async () => {
          try {
            const response = await fetch(`${API_BASE}/api/v1/variables`);
            if (response.ok) {
              const data = await response.json();
              setVariables(data.variables || {});
            }
          } catch (error) {
            console.error('Failed to load variables:', error);
          } finally {
            setIsLoading(false);
          }
        };
        loadVariables();
      }, [API_BASE]);

      // Listen for SSE variable events
      React.useEffect(() => {
        console.log('🔧 Variables SSE useEffect is running');
        console.log('🔧 window.eventSource available?', !!window.eventSource);
        
        const handleVariableCreated = (event) => {
          try {
            const data = event.detail || {};
            console.log('📡 SSE variable:created received:', data);
            if (data.variable) {
              setVariables(prev => {
                const updated = { ...prev, [data.variable.varId]: data.variable };
                console.log('🔄 Variables state updated (created):', updated);
                return updated;
              });
            }
          } catch (error) {
            console.error('Failed to handle variable:created event:', error);
          }
        };

        const handleVariableUpdated = (event) => {
          try {
            const data = event.detail || {};
            console.log('📡 SSE variable:updated received:', data);
            if (data.variable) {
              const updatedVariable = data.variable;
              setVariables(prev => {
                const updated = { ...prev, [updatedVariable.varId]: updatedVariable };
                console.log('🔄 Variables state updated:', updated);
                return updated;
              });
              // For signature variables, update document when label changes
              // (signatures have no value, so they display the label)
              if (updatedVariable.type === 'signature') {
                console.log('🔄 Signature label updated - updating document to show new label:', updatedVariable.displayLabel);
                // Use the variable data from SSE event (which has the new label), not from state
                updateVariableInDocument(updatedVariable);
              }
              // For value variables, name is metadata and doesn't affect document display
            }
          } catch (error) {
            console.error('Failed to handle variable:updated event:', error);
          }
        };

        const handleVariableValueChanged = (event) => {
          try {
            console.log('📡 SSE variable:valueChanged received:', event.detail);
            const data = event.detail || {};
            if (data.variable) {
              console.log('🔄 Updating variable in state and document:', data.variable.varId, data.variable.value);
              setVariables(prev => ({ ...prev, [data.variable.varId]: data.variable }));
              // Update the editing value to reflect the change in the input field
              setEditingValues(prev => ({ ...prev, [data.variable.varId]: data.variable.value }));
              // Value changed - update document to show new value
              updateVariableInDocument(data.variable);
            }
          } catch (error) {
            console.error('Failed to handle variable:valueChanged event:', error);
          }
        };

        const handleVariableDeleted = (event) => {
          try {
            const data = event.detail || {};
            if (data.varId) {
              setVariables(prev => {
                const updated = { ...prev };
                delete updated[data.varId];
                return updated;
              });
            }
          } catch (error) {
            console.error('Failed to handle variable:deleted event:', error);
          }
        };

        const handleVariablesReset = async () => {
          console.log('🔄 Variables reset event received - reloading from backend');
          setVariables({});
          setEditingValues({});
          setEditingNames({});
          
          // Reload variables from backend (they should be restored from seed)
          try {
            const response = await fetch(`${API_BASE}/api/v1/variables`);
            if (response.ok) {
              const data = await response.json();
              setVariables(data.variables || {});
              console.log('✅ Variables reloaded after reset:', Object.keys(data.variables || {}).length);
            } else {
              console.error('❌ Failed to reload variables after reset');
            }
          } catch (error) {
            console.error('❌ Error reloading variables after reset:', error);
          }
        };

        // Listen to window custom events dispatched by main SSE handler
        console.log('✅ Attaching variable window event listeners');
        window.addEventListener('variable:created', handleVariableCreated);
        window.addEventListener('variable:updated', handleVariableUpdated);
        window.addEventListener('variable:valueChanged', handleVariableValueChanged);
        window.addEventListener('variable:deleted', handleVariableDeleted);
        window.addEventListener('variables:reset', handleVariablesReset);

        return () => {
          window.removeEventListener('variable:created', handleVariableCreated);
          window.removeEventListener('variable:updated', handleVariableUpdated);
          window.removeEventListener('variable:valueChanged', handleVariableValueChanged);
          window.removeEventListener('variable:deleted', handleVariableDeleted);
          window.removeEventListener('variables:reset', handleVariablesReset);
        };
      }, []);

      // Helper: Update variable value in document when it changes
      const updateVariableInDocument = async (variable) => {
        const isWordAddin = typeof Office !== 'undefined' && Office.context && Office.context.host;
        
        if (isWordAddin) {
          // Word add-in: Update Content Controls with matching tag
          try {
            await Word.run(async (context) => {
              const contentControls = context.document.contentControls;
              contentControls.load('items');
              await context.sync();
              
              let updated = false;
              for (let i = 0; i < contentControls.items.length; i++) {
                const cc = contentControls.items[i];
                cc.load('tag,title,text');
                await context.sync();
                
                if (cc.tag === variable.varId) {
                  // For signatures, use displayLabel; for values, use value (or label as fallback)
                  const displayText = variable.type === 'signature' 
                    ? variable.displayLabel 
                    : (variable.value || variable.displayLabel);
                  console.log(`🔄 Updating Word CC (type: ${variable.type}): "${cc.text}" → "${displayText}"`);
                  
                  // Load lock status - only cannotEdit and cannotDelete exist in Word JS API
                  cc.load(['cannotEdit', 'cannotDelete']);
                  await context.sync();
                  
                  const wasLocked = cc.cannotEdit;
                  
                  // Temporarily unlock if locked
                  if (wasLocked) {
                    cc.cannotEdit = false;
                    await context.sync();
                  }
                  
                  // Clear existing text and insert new text (preserves Content Control)
                  cc.clear();
                  cc.insertText(displayText, Word.InsertLocation.start);
                  await context.sync();
                  
                  // Re-lock (always lock after update to ensure consistency)
                  cc.cannotEdit = true;
                  cc.cannotDelete = false; // Allow deletion via delete button
                  await context.sync();
                  
                  console.log('✅ Updated Word Content Control:', displayText);
                  updated = true;
                }
              }
              
              if (!updated) {
                console.log(`⚠️ No Content Control found with tag: ${variable.varId}`);
              }
            });
          } catch (error) {
            console.error('❌ Failed to update Word Content Control:', error);
          }
        } else {
          // Web viewer: Update SuperDoc field annotations
          console.log('🔍 Attempting to update SuperDoc field:', variable.varId, variable.value);
          if (!window.superdocInstance) {
            console.error('❌ window.superdocInstance is not available');
            return;
          }
          if (!window.superdocInstance.editor) {
            console.error('❌ window.superdocInstance.editor is not available');
            return;
          }
          
          const editor = window.superdocInstance.editor;
          console.log('🔍 Editor available:', !!editor);
          console.log('🔍 Editor.commands:', !!editor.commands);
          
          // SuperDoc field annotation update: Manually walk ProseMirror document
          // Helpers aren't exposed in UMD build, so we access editor.view.state.doc directly
          
          if (editor.view && editor.view.state && editor.commands) {
            try {
              // For signatures, use displayLabel; for values, use value (or label as fallback)
              const displayText = variable.type === 'signature' 
                ? variable.displayLabel 
                : (variable.value || variable.displayLabel);
              console.log(`🔄 Attempting to update field ${variable.varId} (type: ${variable.type}) with new text: "${displayText}"`);
              
              const doc = editor.view.state.doc;
              const annotations = [];
              const contentControls = [];
              const allNodes = [];
              
              // Manually walk the document to find BOTH field annotations AND content controls
              doc.descendants((node, pos) => {
                // Debug: collect all node types
                allNodes.push({ type: node.type.name, attrs: node.attrs, pos });
                
                // Find Field Annotations (web-created variables)
                if (node.type.name === 'fieldAnnotation' && node.attrs.fieldId === variable.varId) {
                  annotations.push({ node, pos, source: 'fieldAnnotation' });
                }
                
                // Find Content Controls (Word-created variables)
                if (node.type.name === 'structuredContent') {
                  // Extract varId from w:tag in sdtPr.elements
                  let ccVarId = null;
                  if (node.attrs?.sdtPr?.elements) {
                    for (const elem of node.attrs.sdtPr.elements) {
                      if (elem.name === 'w:tag' && elem.attributes?.['w:val']) {
                        ccVarId = elem.attributes['w:val'];
                        break;
                      }
                    }
                  }
                  
                  if (ccVarId === variable.varId) {
                    contentControls.push({ node, pos, source: 'contentControl' });
                  }
                }
              });
              
              const totalFound = annotations.length + contentControls.length;
              console.log(`🔍 Document contains ${allNodes.length} total nodes`);
              console.log(`🔍 Node types in document:`, [...new Set(allNodes.map(n => n.type))]);
              console.log(`🔍 Found ${annotations.length} Field Annotations + ${contentControls.length} Content Controls = ${totalFound} total for ${variable.varId}`);
              
              // Update Field Annotations (web-created variables)
              if (annotations.length > 0) {
                for (let i = annotations.length - 1; i >= 0; i--) {
                  const { node, pos } = annotations[i];
                  const oldLabel = node.attrs.displayLabel;
                  
                  console.log(`📝 Updating Field Annotation ${i + 1}/${annotations.length} at pos ${pos}: "${oldLabel}" → "${displayText}"`);
                  
                  const colors = getVariableColors();
                  editor.commands.deleteFieldAnnotation({ node, pos });
                  editor.commands.addFieldAnnotation(pos, {
                    fieldId: variable.varId,
                    displayLabel: displayText,
                    fieldType: 'TEXTINPUT',
                    fieldColor: colors.borderColor,
                    type: variable.type
                  });
                  
                  console.log(`✅ Replaced Field Annotation ${i + 1}/${annotations.length}`);
                }
              }
              
              // Update Content Controls (Word-created variables)
              if (contentControls.length > 0) {
                console.log(`ℹ️ Found ${contentControls.length} Content Control(s) to update`);
                
                for (let i = 0; i < contentControls.length; i++) {
                  const { node, pos } = contentControls[i];
                  
                  console.log(`🔄 Updating Content Control ${i + 1}/${contentControls.length} at pos ${pos}`);
                  console.log(`   Old text: "${node.textContent}"`);
                  console.log(`   New text: "${displayText}"`);
                  
                  try {
                    // Create a transaction to update the text content
                    // Content Controls have a complex structure with sdtContent inside
                    // We need to find and replace the text nodes within
                    const { state, dispatch } = editor.view;
                    const tr = state.tr;
                    
                    // Find the text node(s) inside the structuredContent node
                    // The structure is: structuredContent > (possibly other nodes) > text
                    let textStart = null;
                    let textEnd = null;
                    
                    node.descendants((childNode, childPos) => {
                      if (childNode.isText || childNode.type.name === 'text') {
                        if (textStart === null) {
                          // First text node - calculate absolute position
                          textStart = pos + childPos + 1; // +1 because pos is before the node
                        }
                        textEnd = pos + childPos + 1 + childNode.nodeSize;
                      }
                    });
                    
                    if (textStart !== null && textEnd !== null) {
                      // Replace the text content
                      tr.replaceWith(textStart, textEnd, state.schema.text(displayText));
                      dispatch(tr);
                      console.log(`✅ Content Control text updated: ${textStart} → ${textEnd}`);
                    } else {
                      // If no text found, try to insert at the beginning of the content
                      console.log(`⚠️ No text nodes found in Content Control, attempting to insert text`);
                      
                      // Try to find sdtContent and insert text there
                      let insertPos = null;
                      node.descendants((childNode, childPos) => {
                        if (insertPos === null && childNode.type.name === 'paragraph') {
                          insertPos = pos + childPos + 2; // +1 for node boundary, +1 to get inside
                        }
                      });
                      
                      if (insertPos !== null) {
                        tr.insertText(displayText, insertPos);
                        dispatch(tr);
                        console.log(`✅ Content Control text inserted at pos ${insertPos}`);
                      } else {
                        console.error(`❌ Could not find insertion point in Content Control`);
                      }
                    }
                  } catch (error) {
                    console.error(`❌ Failed to update Content Control:`, error, error.stack);
                  }
                }
              }
              
              if (totalFound === 0) {
                console.log(`ℹ️ Variable ${variable.varId} not found in document (not yet inserted)`);
              }
            } catch (error) {
              console.error('❌ Failed to update SuperDoc field:', error, error.stack);
            }
          } else {
            console.warn('⚠️ SuperDoc editor.view or commands not available');
            console.log('🔍 editor.view:', !!editor.view);
            console.log('🔍 editor.commands:', !!editor.commands);
          }
        }
      };

      // Helper: Debounced save of variable value
      const handleValueChange = (varId, newValue) => {
        // Update local state immediately
        setEditingValues(prev => ({ ...prev, [varId]: newValue }));
        
        // Clear existing timeout for this variable
        if (saveTimeouts.current[varId]) {
          clearTimeout(saveTimeouts.current[varId]);
        }
        
        // Debounce save (500ms after last keystroke)
        saveTimeouts.current[varId] = setTimeout(async () => {
          try {
            const response = await fetch(`${API_BASE}/api/v1/variables/${varId}/value`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                value: newValue,
                userId: currentUser || 'user1'
              })
            });
            
            if (response.ok) {
              console.log('✅ Variable value saved:', varId, newValue);
              // Update the document to show the new value
              const updatedVariable = variables[varId];
              if (updatedVariable) {
                await updateVariableInDocument({ ...updatedVariable, value: newValue });
              }
            } else {
              console.error('❌ Failed to save variable value');
            }
          } catch (error) {
            console.error('❌ Error saving variable value:', error);
          }
        }, 500);
      };

      // Helper: Rename variable
      const handleRename = async (varId, newName) => {
        if (!newName.trim()) return;
        
        try {
          const response = await fetch(`${API_BASE}/api/v1/variables/${varId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              displayLabel: newName.trim(),
              userId: currentUser || 'user1'
            })
          });
          
          if (response.ok) {
            console.log('✅ Variable renamed:', newName);
            setEditingNames(prev => {
              const updated = { ...prev };
              delete updated[varId];
              return updated;
            });
          } else {
            console.error('❌ Failed to rename variable');
          }
        } catch (error) {
          console.error('❌ Error renaming variable:', error);
        }
      };

      // Helper: Delete variable
      const handleDelete = async (varId, displayLabel) => {
        // Note: Using console log instead of confirm() for Office add-in compatibility
        console.log('🗑️ Deleting variable:', displayLabel);
        
        try {
          const response = await fetch(`${API_BASE}/api/v1/variables/${varId}?userId=${currentUser || 'user1'}`, {
            method: 'DELETE'
          });
          
          if (response.ok) {
            console.log('✅ Variable deleted:', displayLabel);
          } else {
            console.error('❌ Failed to delete variable');
          }
        } catch (error) {
          console.error('❌ Error deleting variable:', error);
        }
      };

      const handleCreate = async () => {
        const name = variableName.trim();
        const email = variableEmail.trim();
        if (!name) return;
        
        // Validate email for signatures
        if (variableType === 'signature' && !email) {
          console.error('❌ Email is required for signatures');
          return;
        }

        setIsCreating(true);
        try {
          // Create variable via API (server will generate varId if not provided)
          const body = {
            displayLabel: name,
            type: variableType,
            value: '',
            userId: currentUser || 'user1'
          };
          
          // Add email for signatures
          if (variableType === 'signature') {
            body.email = email;
          }
          
          const response = await fetch(`${API_BASE}/api/v1/variables`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });

          if (!response.ok) {
            throw new Error('Failed to create variable');
          }

          const result = await response.json();
          console.log('✅ Variable created:', result.variable.displayLabel);

          // Note: Variable is now created and will appear in the list
          // User must click "Insert" button to add it to the document

        } catch (error) {
          console.error('❌ Error creating variable:', error);
        } finally {
          // Always close modal and reset, even on error
          setShowModal(false);
          setVariableName('');
          setVariableEmail('');
          setVariableType('value');
          setIsCreating(false);
        }
      };

      const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
          handleCreate();
        } else if (e.key === 'Escape') {
          setShowModal(false);
          setVariableName('');
          setVariableEmail('');
        }
      };

      // Modal
      const modal = showModal ? React.createElement('div', {
        className: 'd-flex items-center justify-center',
        style: {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 10000
        },
        onClick: () => {
          setShowModal(false);
          setVariableName('');
          setVariableEmail('');
        }
      }, React.createElement('div', {
        className: 'bg-white rounded-lg',
        style: {
          padding: '24px',
          width: '400px',
          maxWidth: '90%',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
        },
        onClick: (e) => e.stopPropagation()
      }, [
        React.createElement('h3', {
          key: 'title',
          className: 'text-lg font-semibold mb-16'
        }, 'Create Variable'),
        React.createElement('div', {
          key: 'type-selector',
          className: 'mb-12'
        }, [
          React.createElement('label', {
            key: 'label',
            className: 'd-block mb-6 text-sm font-medium'
          }, 'Type'),
          React.createElement('div', {
            key: 'types',
            className: 'd-flex gap-8'
          }, [
            React.createElement('button', {
              key: 'value',
              onClick: () => setVariableType('value'),
              className: 'flex-1 text-sm input-border-radius',
              style: {
                padding: '8px',
                border: variableType === 'value' ? '2px solid var(--btn-primary-bg)' : '1px solid var(--color-gray-300)',
                background: variableType === 'value' ? 'var(--color-indigo-50)' : 'var(--color-white)',
                cursor: 'pointer',
                fontWeight: variableType === 'value' ? '600' : '400'
              }
            }, 'Variable'),
            React.createElement('button', {
              key: 'signature',
              onClick: () => setVariableType('signature'),
              className: 'flex-1 text-sm input-border-radius',
              style: {
                padding: '8px',
                border: variableType === 'signature' ? '2px solid var(--btn-primary-bg)' : '1px solid var(--color-gray-300)',
                background: variableType === 'signature' ? 'var(--color-indigo-50)' : 'var(--color-white)',
                cursor: 'pointer',
                fontWeight: variableType === 'signature' ? '600' : '400'
              }
            }, 'Signature')
          ])
        ]),
        React.createElement('input', {
          key: 'input-name',
          type: 'text',
          value: variableName,
          onChange: (e) => setVariableName(e.target.value),
          onKeyDown: handleKeyPress,
          placeholder: variableType === 'value' ? 'e.g., Contract Amount' : 'e.g., Party A Signature',
          autoFocus: true,
          className: 'input-padding input-border input-border-radius text-base mb-12',
          style: { 
            width: '100%',
            boxSizing: 'border-box'
          }
        }),
        // Email field for signatures (required)
        variableType === 'signature' ? React.createElement('input', {
          key: 'input-email',
          type: 'email',
          value: variableEmail,
          onChange: (e) => setVariableEmail(e.target.value),
          onKeyDown: handleKeyPress,
          placeholder: 'Email address (required)',
          required: true,
          className: 'input-padding input-border input-border-radius text-base mb-16',
          style: { 
            width: '100%',
            boxSizing: 'border-box'
          }
        }) : null,
        React.createElement('div', {
          key: 'buttons',
          className: 'd-flex gap-8 justify-end'
        }, [
          React.createElement(UIButton, {
            key: 'cancel',
            label: 'Cancel',
            variant: 'secondary',
            onClick: () => {
              setShowModal(false);
              setVariableName('');
              setVariableEmail('');
            },
            disabled: isCreating
          }),
          React.createElement(UIButton, {
            key: 'create',
            label: isCreating ? 'Creating...' : 'Create',
            variant: 'primary',
            onClick: handleCreate,
            disabled: !variableName.trim() || (variableType === 'signature' && !variableEmail.trim()) || isCreating,
            isLoading: isCreating
          })
        ])
      ])) : null;

      // Main panel UI - container style matches Versions panel
      return React.createElement('div', { className: 'd-flex flex-column gap-8 pt-3 pb-16' }, [
        modal,
        React.createElement('div', {
          key: 'header',
          className: 'd-flex justify-between items-center gap-8'
        }, [
          // Filter dropdown
          React.createElement('select', {
            key: 'filter',
            value: filterType,
            onChange: (e) => setFilterType(e.target.value),
            className: 'input-padding input-border input-border-radius text-sm',
            style: { minWidth: '120px' }
          }, [
            React.createElement('option', { key: 'all', value: 'all' }, 'All'),
            React.createElement('option', { key: 'value', value: 'value' }, 'Variables'),
            React.createElement('option', { key: 'signature', value: 'signature' }, 'Signatures')
          ]),
          // Create button
          React.createElement(UIButton, {
            key: 'add',
            label: '+ Create Variable',
            onClick: () => setShowModal(true),
            variant: 'primary'
          })
        ]),
        (() => {
          if (isLoading) {
            return React.createElement('div', {
              className: 'text-gray-500 p-8'
            }, 'Loading variables...');
          }

          let variablesList = Object.values(variables);
          
          // Apply filter
          if (filterType !== 'all') {
            variablesList = variablesList.filter(v => v.type === filterType);
          }
          
          if (variablesList.length === 0) {
            return React.createElement('div', {
              className: 'text-gray-500 p-8'
            }, filterType === 'all' ? 'No variables yet.' : `No ${filterType === 'signature' ? 'signatures' : 'variables'} yet.`);
          }

          // Show variables list with inline value editing - card style matches Versions panel
          return React.createElement('div', { className: 'd-flex flex-column gap-8' }, variablesList.map((variable) => React.createElement('div', {
            key: variable.varId,
            className: 'border border-gray-200 rounded-xl bg-white',
            style: { padding: '14px 16px' }
          }, [
            // EDIT MODE - Show editable fields
            editingNames[variable.varId] !== undefined
              ? React.createElement('div', {
                  key: 'edit-mode',
                  className: 'd-flex flex-column gap-12'
                }, [
                  // Name input
                  React.createElement('div', { key: 'name-field' }, [
                    React.createElement('label', {
                      key: 'label',
                      className: 'd-block text-sm text-gray-500 mb-4 font-medium'
                    }, variable.type === 'signature' ? 'Signature Name' : 'Variable Name'),
                    React.createElement('input', {
                      key: 'input',
                      type: 'text',
                      value: editingNames[variable.varId],
                      onChange: (e) => setEditingNames(prev => ({ ...prev, [variable.varId]: e.target.value })),
                      onClick: (e) => e.stopPropagation(),
                      className: 'w-full font-mono text-base input-padding input-border input-border-radius'
                    })
                  ]),
                  // Value input
                  React.createElement('div', { key: 'value-field' }, [
                    // Only show label for signatures (Email Address), no label for value types
                    variable.type === 'signature' ? React.createElement('label', {
                      key: 'label',
                      className: 'd-block text-sm text-gray-500 mb-4 font-medium'
                    }, 'Email Address') : null,
                    React.createElement('input', {
                      key: 'input',
                      type: 'text',
                      value: editingValues[variable.varId] !== undefined 
                        ? editingValues[variable.varId] 
                        : (variable.type === 'signature' ? (variable.email || '') : (variable.value || '')),
                      onChange: (e) => setEditingValues(prev => ({ ...prev, [variable.varId]: e.target.value })),
                      onClick: (e) => e.stopPropagation(),
                      className: 'w-full font-mono text-base input-padding input-border input-border-radius',
                      placeholder: variable.type === 'signature' ? 'Enter email address...' : 'Enter value...'
                    })
                  ]),
                  // Buttons
                  React.createElement('div', {
                    key: 'buttons',
                    className: 'd-flex gap-8 justify-end'
                  }, [
                    React.createElement(UIButton, {
                      key: 'cancel',
                      label: 'Cancel',
                      variant: 'secondary',
                      onClick: (e) => {
                        e?.stopPropagation?.();
                        setEditingNames(prev => {
                          const updated = { ...prev };
                          delete updated[variable.varId];
                          return updated;
                        });
                        setEditingValues(prev => {
                          const updated = { ...prev };
                          delete updated[variable.varId];
                          return updated;
                        });
                      }
                    }),
                    React.createElement(UIButton, {
                      key: 'save',
                      label: 'Save',
                      variant: 'primary',
                      onClick: async (e) => {
                        e?.stopPropagation?.();
                        
                        // Save name if changed
                        if (editingNames[variable.varId] !== variable.displayLabel) {
                          await handleRename(variable.varId, editingNames[variable.varId]);
                        }
                        
                        const currentValue = editingValues[variable.varId];
                        
                        // For signatures, the "value" field is actually the email
                        if (variable.type === 'signature') {
                          if (currentValue !== undefined && currentValue !== variable.email) {
                            try {
                              const response = await fetch(`${API_BASE}/api/v1/variables/${variable.varId}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  email: currentValue,
                                  userId: currentUser || 'user1'
                                })
                              });
                              
                              if (response.ok) {
                                console.log('✅ Signature email updated:', currentValue);
                              } else {
                                console.error('❌ Failed to update signature email');
                              }
                            } catch (error) {
                              console.error('❌ Error updating signature email:', error);
                            }
                          }
                        } else {
                          // For value types, save the value
                          if (currentValue !== undefined && currentValue !== variable.value) {
                            await handleValueChange(variable.varId, currentValue);
                          }
                        }
                        
                        // Exit edit mode
                        setEditingNames(prev => {
                          const updated = { ...prev };
                          delete updated[variable.varId];
                          return updated;
                        });
                      }
                    })
                  ])
                ])
              // READ-ONLY MODE - Show display with buttons
              : React.createElement('div', {
                  key: 'read-mode',
                  className: 'd-flex flex-column gap-8'
                }, [
                  // Header with name and buttons
                  React.createElement('div', {
                    key: 'header',
                    className: 'd-flex justify-between items-center'
                  }, [
                    React.createElement('div', {
                      key: 'info',
                      className: 'flex-1 min-w-0'
                    }, [
                      React.createElement('div', {
                        key: 'name',
                        className: 'font-semibold text-lg mb-2',
                        style: {
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }
                      }, variable.displayLabel),
                      variable.type === 'signature' ? React.createElement('div', {
                        key: 'meta',
                        className: 'text-sm text-gray-500'
                      }, `Signature${variable.email ? ' • ' + variable.email : ''}`) : null
                    ]),
                    React.createElement('div', {
                      key: 'buttons',
                      className: 'd-flex gap-8 items-center'
                    }, [
                      React.createElement(UIButton, {
                        key: 'edit',
                        label: 'Edit',
                        variant: 'tertiary',
                        onClick: (e) => {
                          e?.stopPropagation?.();
                          setEditingNames(prev => ({ ...prev, [variable.varId]: variable.displayLabel }));
                          // For signatures, load email; for values, load value
                          const editValue = variable.type === 'signature' ? (variable.email || '') : (variable.value || '');
                          setEditingValues(prev => ({ ...prev, [variable.varId]: editValue }));
                        }
                      }),
                      React.createElement(UIButton, {
                        key: 'delete',
                        label: 'Delete',
                        variant: 'tertiary',
                        onClick: (e) => {
                          e?.stopPropagation?.();
                          handleDelete(variable.varId, variable.displayLabel);
                        }
                      }),
                      React.createElement(UIButton, {
                        key: 'insert',
                        label: 'Insert',
                        variant: 'primary',
                        onClick: async (e) => {
                          e?.stopPropagation?.();
                          
                          // Get fresh data from state to avoid stale closure issues
                          const freshVariable = variables[variable.varId];
                          if (!freshVariable) {
                            console.error('❌ Variable not found in state:', variable.varId);
                            return;
                          }
                          
                          console.log('🔵 Insert variable clicked:', freshVariable.displayLabel);
                          
                          // For signatures, use displayLabel; for values, use value (or label as fallback)
                          const displayText = freshVariable.type === 'signature' 
                            ? freshVariable.displayLabel 
                            : (freshVariable.value || freshVariable.displayLabel);
                          
                          const isWordAddin = typeof Office !== 'undefined' && Office.context && Office.context.host;
                          
                          if (isWordAddin) {
                            try {
                              await Word.run(async (context) => {
                                const range = context.document.getSelection();
                                const contentControl = range.insertContentControl();
                                const colors = getVariableColors();
                                contentControl.title = freshVariable.displayLabel;
                                contentControl.tag = freshVariable.varId;
                                contentControl.appearance = 'BoundingBox';
                                contentControl.color = colors.borderColor;
                                contentControl.insertText(displayText, 'Replace');
                                contentControl.font.highlightColor = colors.highlightColor;
                                contentControl.font.bold = true;
                                
                                await context.sync();
                                
                                contentControl.cannotEdit = true;
                                contentControl.cannotDelete = false;
                                
                                await context.sync();
                                console.log('✅ Variable inserted and LOCKED in Word document:', displayText);
                              });
                            } catch (error) {
                              console.error('❌ Failed to insert into Word document:', error);
                            }
                          } else {
                            if (!window.superdocInstance || !window.superdocInstance.editor) {
                              console.error('❌ SuperDoc not available');
                              return;
                            }
                            
                            const editor = window.superdocInstance.editor;
                            if (!editor.commands || typeof editor.commands.addFieldAnnotationAtSelection !== 'function') {
                              console.error('❌ Field Annotation plugin not loaded');
                              return;
                            }
                            
                            try {
                              const colors = getVariableColors();
                              editor.commands.addFieldAnnotationAtSelection({
                                fieldId: freshVariable.varId,
                                displayLabel: displayText,
                                fieldType: 'TEXTINPUT',
                                fieldColor: colors.borderColor,
                                type: freshVariable.type
                              });
                              console.log('✅ Variable inserted into SuperDoc:', freshVariable.displayLabel);
                            } catch (error) {
                              console.error('❌ Failed to insert into SuperDoc:', error);
                            }
                          }
                        }
                      })
                    ])
                  ]),
                  // Value display (read-only) - show email for signatures, value for value types
                  React.createElement('div', {
                    key: 'value',
                    className: 'text-sm text-gray-600 font-mono',
                    style: {
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }
                  }, variable.type === 'signature' ? (variable.email || '') : (variable.value || variable.displayLabel))
                ])
          ])));
        })()
      ]);
    }

    function App(props) {
      const [modal, setModal] = React.useState(null);
      const { config } = props;
      const { documentSource, actions, approvalsSummary, messagingCount, activities, lastSeenActivityId, viewingVersion } = React.useContext(StateContext);
      React.useEffect(() => {
        function onOpen(ev) { 
          
          try { 
            const d = ev.detail || {}; 
            if (d && (d.id === 'send-vendor' || d.id === 'sendVendor')) setModal({ id: 'send-vendor', userId: d.options?.userId || 'user1' }); 
            if (d && d.id === 'approvals') setModal({ id: 'approvals' }); 
            if (d && d.id === 'compile') setModal({ id: 'compile' }); 
            if (d && d.id === 'notifications') setModal({ id: 'notifications' }); 
            if (d && d.id === 'request-review') setModal({ id: 'request-review' }); 
            if (d && d.id === 'message') setModal({ id: 'message', toUserId: d.options?.toUserId, toUserName: d.options?.toUserName }); 
            if (d && (d.id === 'open-gov' || d.id === 'openGov')) setModal({ id: 'open-gov' }); 
            if (d && d.id === 'system-prompt-editor') setModal({ id: 'system-prompt-editor' }); 
            if (d && d.id === 'version-outdated-checkout') {
              
              setModal({ 
                id: 'version-outdated-checkout', 
                currentVersion: d.options?.currentVersion, 
                clientVersion: d.options?.clientVersion, 
                viewingVersion: d.options?.viewingVersion, 
                message: d.options?.message, 
                userId: d.options?.userId 
              });
            }
          } catch (e) {
            console.error('Error in modal onOpen:', e);
          }
        }
        window.addEventListener('react:open-modal', onOpen);
        return () => window.removeEventListener('react:open-modal', onOpen);
      }, []);
  
      const [confirm, setConfirm] = React.useState(null);
      const ask = (kind) => {
        
        if (kind === 'reset') setConfirm({ title: 'Factory reset?', message: 'This will clear working data.', onConfirm: actions.factoryReset });
      };

      const onClose = () => setModal(null);
      const onConfirmClose = () => setConfirm(null);

      const renderModal = () => {
        
        if (!modal) return null;
        switch (modal.id) {
          case 'send-vendor':
            return React.createElement(SendVendorModal, { userId: modal.userId, onClose });
          case 'approvals':
            return React.createElement(ApprovalsModal, { onClose });
          case 'compile':
            return React.createElement(CompileModal, { onClose });
          case 'notifications':
            return React.createElement(NotificationsModal, { onClose });
          case 'request-review':
            return React.createElement(RequestReviewModal, { onClose });
          case 'message':
            return React.createElement(MessageModal, { toUserId: modal.toUserId, toUserName: modal.toUserName, onClose });
          case 'open-gov':
            return React.createElement(OpenGovModal, { onClose });
          case 'version-outdated-checkout':
            return React.createElement(VersionOutdatedCheckoutModal, { currentVersion: modal.currentVersion, clientVersion: modal.clientVersion, viewingVersion: modal.viewingVersion, message: modal.message, userId: modal.userId, onClose });
          case 'system-prompt-editor':
            return React.createElement(SystemPromptEditorModal, { onClose });
          default:
            return null;
        }
      };

      const isWordHost = (typeof Office !== 'undefined');
      const topRowStyle = { gap: 5, paddingTop: (isWordHost ? 0 : 8) };
      const topPanel = React.createElement('div', { className: 'panel panel--top' }, [
        React.createElement('div', { className: 'd-flex items-center', style: topRowStyle }, [
          React.createElement(StatusBadge, { key: 'status' }),
          (isWordHost ? React.createElement(UIButton, { key: 'open-og', label: 'Open in OpenGov ↗', onClick: () => { try { window.dispatchEvent(new CustomEvent('react:open-modal', { detail: { id: 'open-gov' } })); } catch {} }, variant: 'tertiary', style: { marginLeft: 'auto' } }) : null),
        ]),
        React.createElement(InlineTitleEditor, { key: 'title' }),
        React.createElement(ErrorBanner, null),
        (typeof Office === 'undefined' ? React.createElement(SuperDocHost, { key: 'host', src: documentSource }) : null),
        React.createElement('div', { className: '', style: { marginTop: 8 } }, [
          React.createElement('div', { className: 'd-flex items-center gap-8 flex-wrap' }, [
            React.createElement(LastUpdatedPrefix, { key: 'last' }),
            React.createElement(UserCard, { key: 'user' }),
          ]),
        ]),
        React.createElement('div', { className: 'pt-2', style: { paddingTop: 8, marginTop: 0 } }, [
          React.createElement(ActionButtons, { key: 'actions' }),
        ]),
      ]);

      // Bottom section: two tabs - AI and Workflow
      const [activeTab, setActiveTab] = React.useState('AI');
      const [underline, setUnderline] = React.useState({ left: 0, width: 0 });
      const tabbarRef = React.useRef(null);
      const aiLabelRef = React.useRef(null);
      const wfLabelRef = React.useRef(null);
      const msgLabelRef = React.useRef(null);
      const cmtLabelRef = React.useRef(null);
      
      // Factory reset: navigate back to AI tab
      React.useEffect(() => {
        const onFactoryReset = () => {
          setActiveTab('AI');
        };
        window.addEventListener('factoryReset', onFactoryReset);
        return () => window.removeEventListener('factoryReset', onFactoryReset);
      }, []);
      const verLabelRef = React.useRef(null);
      const actLabelRef = React.useRef(null);
      const cmpLabelRef = React.useRef(null);
      const variablesLabelRef = React.useRef(null);
      const prevTabRef = React.useRef(activeTab);
      
      // Reload document when leaving Comparison tab to remove comparison highlights
      React.useEffect(() => {
        const wasOnComparison = prevTabRef.current === 'Comparison';
        const nowOnComparison = activeTab === 'Comparison';
        
        if (wasOnComparison && !nowOnComparison) {
          // Switching away from Comparison - reload current version
          try {
            const version = viewingVersion || 1;
            window.dispatchEvent(new CustomEvent('version:view', { 
              detail: { version, source: 'tab-switch' } 
            }));
          } catch {}
        }
        
        prevTabRef.current = activeTab;
      }, [activeTab, viewingVersion]);

      const recalcUnderline = React.useCallback(() => {
        try {
          const bar = tabbarRef.current;
          const labelEl = (activeTab === 'AI'
            ? aiLabelRef.current
            : (activeTab === 'Workflow'
              ? wfLabelRef.current
              : (activeTab === 'Messaging'
                ? msgLabelRef.current
                : (activeTab === 'Versions'
                  ? verLabelRef.current
                : (activeTab === 'Activity'
                    ? actLabelRef.current
                    : (activeTab === 'Comparison'
                      ? cmpLabelRef.current
                      : (activeTab === 'Comments'
                        ? cmtLabelRef.current
                        : variablesLabelRef.current)))))));
          if (!bar || !labelEl) return;
          const barRect = bar.getBoundingClientRect();
          const labRect = labelEl.getBoundingClientRect();
          const width = Math.max(24, Math.round(labRect.width));
          const left = Math.round((labRect.left - barRect.left) + (labRect.width / 2) - (width / 2));
          setUnderline({ left, width });
        } catch {}
      }, [activeTab]);

      React.useEffect(() => { recalcUnderline(); }, [recalcUnderline]);
      // Recalculate underline if the Workflow, Messages, or Activity tab label width changes due to count updates
      React.useEffect(() => { recalcUnderline(); }, [approvalsSummary, messagingCount, activities, lastSeenActivityId, recalcUnderline]);
      React.useEffect(() => {
        const onResize = () => recalcUnderline();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
      }, [recalcUnderline]);

      const Tabs = React.createElement('div', { className: 'mt-3 pt-2', style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } }, [
        React.createElement('div', { key: 'tabbar', ref: tabbarRef, className: 'd-flex gap-8 border-b border-gray-200', style: { position: 'relative', padding: '0 8px', alignItems: 'flex-end' } }, [
          React.createElement('button', {
            key: 'tab-ai',
            className: activeTab === 'AI' ? 'tab tab--active' : 'tab',
            onClick: () => setActiveTab('AI'),
            style: { background: 'transparent', border: 'none', padding: '8px 6px', cursor: 'pointer', color: activeTab === 'AI' ? '#111827' : '#6B7280', fontWeight: 600 }
          }, React.createElement('span', { ref: aiLabelRef, style: { display: 'inline-block' } }, 'AI')),
          React.createElement('button', {
            key: 'tab-workflow',
            className: activeTab === 'Workflow' ? 'tab tab--active' : 'tab',
            onClick: () => setActiveTab('Workflow'),
            style: { background: 'transparent', border: 'none', padding: '8px 6px 8px 6px', cursor: 'pointer', color: activeTab === 'Workflow' ? '#111827' : '#6B7280', fontWeight: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: '2px' }
          }, [
            (approvalsSummary && typeof approvalsSummary.total === 'number'
              ? React.createElement('span', { key: 'count', style: { fontSize: '11px', lineHeight: '1' } }, `(${approvalsSummary.approved || 0}/${approvalsSummary.total})`)
              : null),
            React.createElement('span', { key: 'label', ref: wfLabelRef, style: { display: 'inline-block' } }, 'Workflow')
          ]),
          React.createElement('button', {
            key: 'tab-messaging',
            className: activeTab === 'Messaging' ? 'tab tab--active' : 'tab',
            onClick: () => {
              setActiveTab('Messaging');
              // Dispatch event to reset messaging view to list
              try { window.dispatchEvent(new CustomEvent('messaging:goHome')); } catch {}
            },
            style: { background: 'transparent', border: 'none', padding: '8px 6px 8px 6px', cursor: 'pointer', color: activeTab === 'Messaging' ? '#111827' : '#6B7280', fontWeight: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: '2px' }
          }, [
            (messagingCount > 0
              ? React.createElement('span', { key: 'count', style: { fontSize: '11px', lineHeight: '1' } }, `(${messagingCount})`)
              : null),
            React.createElement('span', { key: 'label', ref: msgLabelRef, style: { display: 'inline-block' } }, 'Messages')
          ]),
          React.createElement('button', {
            key: 'tab-versions',
            className: activeTab === 'Versions' ? 'tab tab--active' : 'tab',
            onClick: () => setActiveTab('Versions'),
            style: { background: 'transparent', border: 'none', padding: '8px 6px', cursor: 'pointer', color: activeTab === 'Versions' ? '#111827' : '#6B7280', fontWeight: 600 }
          }, React.createElement('span', { ref: verLabelRef, style: { display: 'inline-block' } }, 'Versions')),
          React.createElement('button', {
            key: 'tab-comments',
            className: activeTab === 'Comments' ? 'tab tab--active' : 'tab',
            onClick: () => setActiveTab('Comments'),
            style: { background: 'transparent', border: 'none', padding: '8px 6px', cursor: 'pointer', color: activeTab === 'Comments' ? '#111827' : '#6B7280', fontWeight: 600 }
          }, React.createElement('span', { ref: cmtLabelRef, style: { display: 'inline-block' } }, 'Comments')),
          React.createElement('button', {
            key: 'tab-activity',
            className: activeTab === 'Activity' ? 'tab tab--active' : 'tab',
            onClick: () => setActiveTab('Activity'),
            style: { background: 'transparent', border: 'none', padding: '8px 6px 8px 6px', cursor: 'pointer', color: activeTab === 'Activity' ? '#111827' : '#6B7280', fontWeight: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: '2px' }
          }, [
            (() => {
              if (!activities || !Array.isArray(activities) || activities.length === 0) return null;
              const unseenCount = activities.filter(a => !lastSeenActivityId || a.id > lastSeenActivityId).length;
              if (unseenCount === 0) return null;
              return React.createElement('span', { key: 'count', style: { fontSize: '11px', lineHeight: '1' } }, `(${unseenCount})`);
            })(),
            React.createElement('span', { key: 'label', ref: actLabelRef, style: { display: 'inline-block' } }, 'Activity')
          ]),
          // New Comparison tab
          React.createElement('button', {
            key: 'tab-compare',
            className: activeTab === 'Comparison' ? 'tab tab--active' : 'tab',
            onClick: () => setActiveTab('Comparison'),
            style: { background: 'transparent', border: 'none', padding: '8px 6px', cursor: 'pointer', color: activeTab === 'Comparison' ? '#111827' : '#6B7280', fontWeight: 600 }
          }, React.createElement('span', { ref: cmpLabelRef, style: { display: 'inline-block' } }, 'Compare')),
          // Variables tab (Phase 3)
          React.createElement('button', {
            key: 'tab-variables',
            className: activeTab === 'Variables' ? 'tab tab--active' : 'tab',
            onClick: () => setActiveTab('Variables'),
            style: { background: 'transparent', border: 'none', padding: '8px 6px', cursor: 'pointer', color: activeTab === 'Variables' ? '#111827' : '#6B7280', fontWeight: 600 }
          }, React.createElement('span', { ref: variablesLabelRef, style: { display: 'inline-block' } }, 'Variables')),
        React.createElement('div', { key: 'underline', style: { position: 'absolute', bottom: -1, left: underline.left, width: underline.width, height: 2, background: '#6d5ef1', transition: 'left 150ms ease, width 150ms ease' } })
        ]),
        React.createElement('div', { key: 'tabbody', className: (activeTab === 'AI' || activeTab === 'Activity') ? '' : 'mt-3', style: { flex: 1, minHeight: 0, overflowY: (activeTab === 'AI' || activeTab === 'Activity') ? 'hidden' : 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', padding: (activeTab === 'AI' || activeTab === 'Activity') ? '0' : '0 8px 112px 8px', marginTop: (activeTab === 'AI' || activeTab === 'Activity') ? 0 : undefined } }, [
          React.createElement('div', { key: 'wrap-ai', style: { display: (activeTab === 'AI' ? 'flex' : 'none'), flex: 1, height: '100%', flexDirection: 'column' } }, React.createElement(ChatConsole, { key: 'chat' })),
          React.createElement('div', { key: 'wrap-workflow', style: { display: (activeTab === 'Workflow' ? 'block' : 'none') } }, React.createElement(WorkflowApprovalsPanel, { key: 'workflow' })),
          React.createElement('div', { key: 'wrap-messaging', style: { display: (activeTab === 'Messaging' ? 'block' : 'none') } }, React.createElement(MessagingPanel, { key: 'messaging' })),
          React.createElement('div', { key: 'wrap-versions', style: { display: (activeTab === 'Versions' ? 'block' : 'none') } }, React.createElement(VersionsPanel, { key: 'versions' })),
          // New Comments tab: host SuperDoc comments sidebar
          React.createElement('div', { key: 'wrap-comments', style: { display: (activeTab === 'Comments' ? 'flex' : 'none'), flex: 1, height: '100%', flexDirection: 'column' } }, [
            React.createElement('div', { key: 'comments-container', id: 'comments-container', style: { flex: 1, minHeight: 0, overflowY: 'auto', background: '#fafafa', borderTop: '1px solid #e5e7eb' } })
          ]),
          React.createElement('div', { key: 'wrap-activity', style: { display: (activeTab === 'Activity' ? 'flex' : 'none'), flex: 1, height: '100%', flexDirection: 'column' } }, React.createElement(ActivityPanel, { key: 'activity', isActive: activeTab === 'Activity' })),
          React.createElement('div', { key: 'wrap-compare', style: { display: (activeTab === 'Comparison' ? 'block' : 'none') } }, React.createElement(ComparisonTab, { key: 'compare' })),
          React.createElement('div', { key: 'wrap-variables', style: { display: (activeTab === 'Variables' ? 'block' : 'none') } }, React.createElement(VariablesPanel, { key: 'variables' }))
        ])
      ]);

      // Confine scroll to the sidebar body; header and underline remain fixed
      const assistantPanel = React.createElement('div', { className: 'panel panel--assistant', style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } }, [
        Tabs,
        renderModal(),
        (confirm ? React.createElement(ConfirmModal, { title: confirm.title, message: confirm.message, onConfirm: confirm.onConfirm, onClose: onConfirmClose }) : null)
      ]);

      // When Comments tab is activated, remount SuperDoc with the comments container so the sidebar renders here
      React.useEffect(() => {
        if (activeTab === 'Comments') {
          try {
            const bridge = (typeof window !== 'undefined') ? window.SuperDocBridge : null;
            if (bridge && typeof bridge.open === 'function') {
              bridge.open('/documents/working/default.docx');
            }
          } catch {}
        }
      }, [activeTab]);

      const container = React.createElement('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } }, [topPanel, assistantPanel]);

      return React.createElement(ThemeProvider, null, React.createElement(React.Fragment, null, [container, React.createElement(BannerDropEffect, { key: 'banner' }), React.createElement(ApprovalCelebration, { key: 'celebration' })]));
    }

    const root = ReactDOM.createRoot(rootEl);
    root.render(React.createElement(StateProvider, null));
  }

  try {
    win.mountReactApp = mountReactApp;
    win.openReactModal = function(id, options) {
      try { window.dispatchEvent(new CustomEvent('react:open-modal', { detail: { id, options: options || {} } })); } catch {}
    };
  } catch (_) {}
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));


