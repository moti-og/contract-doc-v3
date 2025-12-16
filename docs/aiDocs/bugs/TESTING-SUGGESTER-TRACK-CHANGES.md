# Testing Guide: Suggester Track Changes Mode

## Quick Start - Run Locally

### Option 1: Automated (Recommended)
```powershell
# From repo root
./tools/scripts/servers.ps1 -Action start
```

This starts:
- Main server: `https://localhost:4001` (web viewer)
- Word add-in dev server: `https://localhost:4000`
- Collaboration backend: `http://localhost:4002` (optional)

Then open: **https://localhost:4001**

### Option 2: Manual Start
```powershell
# Terminal 1: Main server
cd server
npm ci
node src/server.js

# Terminal 2: Word add-in (optional, for Word testing)
cd addin
npm ci
npm run dev-server

# Terminal 3: Collaboration (optional)
cd collab
node server.js
```

Open browser: **https://localhost:4001**

---

## Testing Steps

### 1. Initial Load as Suggester

1. **Start servers** (see above)
2. **Open web viewer**: `https://localhost:4001`
3. **Select suggester role** from user dropdown (e.g., "Yuri Lee Laffed" or any user with suggester role)
4. **Load a document** (if not auto-loaded)
5. **Check browser console** - should see:
   ```
   🔄 SuperDocBridge.open() - Role: suggester | Mode: suggesting | User: ...
   ```
6. **Verify SuperDoc mode**:
   - Toolbar should show "Suggesting" mode badge
   - Make an edit (type some text)
   - Edit should appear as **tracked change** (red underline/strikethrough)
   - NOT as direct edit

### 2. Switch to Suggester After Load

1. **Start as editor**:
   - Load document as "Warren Peace" (editor)
   - Verify you can make direct edits (no tracking)
2. **Switch to suggester**:
   - Change user dropdown to suggester (e.g., "Yuri Lee Laffed")
   - **Check console** - should see:
     ```
     🔄 Role changed from 'editor' to 'suggester' - remounting SuperDoc
     📢 Dispatched superdoc:set-mode: editor → suggester (suggesting)
     🔄 SuperDocBridge.open() - Role: suggester | Mode: suggesting | User: ...
     ```
3. **Verify behavior**:
   - SuperDoc should remount
   - Toolbar should show "Suggesting" mode
   - Make an edit → should be tracked
   - Cannot switch to editing mode (locked)

### 3. Verify Track Changes Are Working

1. **As suggester**, make these edits:
   - Type new text → should show as **insertion** (red underline)
   - Delete text → should show as **deletion** (red strikethrough)
   - Modify text → should show both insertion and deletion
2. **Check comments sidebar** (if visible):
   - Tracked changes should appear as comments
   - Can add regular comments
3. **Export to DOCX**:
   - Tracked changes should be preserved in exported file

### 4. Test Role Switching

1. **Editor → Suggester → Editor → Suggester**
   - Each switch should remount SuperDoc
   - Mode should change correctly each time
   - Console should show role change logs

### 5. Debug Console Commands

Open browser console (F12) and run:

```javascript
// Check current role
console.log('Role:', window.userStateBridge?.role);

// Check SuperDoc instance
const instance = window.superdocInstance;
console.log('SuperDoc role:', instance?.role);
console.log('SuperDoc mode:', instance?.documentMode);

// Check if in suggesting mode
console.log('Is suggesting?', instance?.documentMode === 'suggesting');
console.log('Is role suggester?', instance?.role === 'suggester');

// Check __IS_DEBUG__ (required for track changes)
console.log('__IS_DEBUG__:', window.__IS_DEBUG__);
```

**Expected output for suggester:**
- `Role: suggester`
- `SuperDoc role: suggester`
- `SuperDoc mode: suggesting`
- `Is suggesting?: true`
- `Is role suggester?: true`
- `__IS_DEBUG__: false`

---

## Troubleshooting

### Issue: Not locking into track changes mode

**Check:**
1. Browser console for errors
2. `window.__IS_DEBUG__` is `false` (required!)
3. SuperDoc instance has correct `role` and `documentMode`
4. Role change logs appear in console

**Fix:**
- If `__IS_DEBUG__` is missing, check `web/view.html` line 17
- If role/mode are wrong, check `SuperDocHost` component
- If no role change logs, check `setUser` action

### Issue: Edits not being tracked

**Possible causes:**
1. SuperDoc not in `suggesting` mode
2. `__IS_DEBUG__` not set
3. SuperDoc version issue

**Debug:**
```javascript
// Check SuperDoc version
console.log('SuperDoc version:', window.SuperDoc?.version || 'unknown');

// Force remount
window.SuperDocBridge.open({ id: 'default', type: 'docx', url: window.location.href });
```

### Issue: Role switch doesn't remount

**Check:**
1. Console for role change logs
2. `SuperDocHost` effect dependencies
3. `currentRole` from StateContext

**Debug:**
```javascript
// Manually trigger remount
const role = window.userStateBridge?.role;
const modeMap = {
  'viewer': 'viewing',
  'suggester': 'suggesting',
  'vendor': 'suggesting',
  'editor': 'editing'
};
const mode = modeMap[role] || 'editing';
window.dispatchEvent(new CustomEvent('superdoc:set-mode', { 
  detail: { mode, role } 
}));
```

---

## Expected Behavior Summary

| Action | Expected Result |
|--------|----------------|
| Load as suggester | SuperDoc mounts with `role: 'suggester'`, `documentMode: 'suggesting'` |
| Switch to suggester | SuperDoc remounts with correct role/mode |
| Make edit as suggester | Edit tracked as change (red underline/strikethrough) |
| Switch modes (suggester) | Mode switcher disabled/locked (cannot change) |
| Export DOCX | Tracked changes preserved in file |

---

## Files to Check if Broken

1. **`shared-ui/components.react.js`**:
   - `SuperDocHost` component (line ~5934)
   - `setUser` action (line ~1549)
   - `StateContext.Provider` (line ~1687) - must include `currentRole`

2. **`web/superdoc-init.js`**:
   - `SuperDocBridge.open()` (line ~385) - must read role and mode
   - `mountSuperdoc()` (line ~64) - must pass role and documentMode

3. **`web/view.html`**:
   - Line 17: `window.__IS_DEBUG__ = false;` (required!)

---

## Quick Test Script

Save as `test-suggester.ps1`:

```powershell
# Start servers
./tools/scripts/servers.ps1 -Action start

# Wait for servers
Start-Sleep -Seconds 5

# Open browser
Start-Process "https://localhost:4001"

Write-Host "✅ Servers started. Open browser console (F12) and:"
Write-Host "1. Select suggester role from dropdown"
Write-Host "2. Check console for role change logs"
Write-Host "3. Make an edit - should be tracked"
```

