# Bug: Suggester Not Locked into Track Changes Mode on Web

**Status:** 🔴 Open  
**Severity:** High  
**Reported:** User report - "when i edit as a suggestor it's not locking me into track changes mode"

## Problem Description

When a user switches to "suggester" role in the web interface, SuperDoc should automatically lock them into `suggesting` mode (track changes mode). However, the editor remains in `editing` mode, allowing direct edits without tracking.

## Expected Behavior

1. User selects "suggester" role from dropdown
2. SuperDoc should automatically remount with:
   - `role: 'suggester'`
   - `documentMode: 'suggesting'`
3. All edits should be tracked as changes
4. User should NOT be able to switch to editing mode (locked)

## Actual Behavior

1. User selects "suggester" role from dropdown
2. `window.userStateBridge.role` is updated ✅
3. SuperDoc instance is NOT remounted ❌
4. SuperDoc remains in previous mode (usually `editing`)
5. Edits are NOT tracked as changes ❌

## Root Cause Analysis

### Issue 1: SuperDocHost Doesn't React to Role Changes

**File:** `shared-ui/components.react.js` (line ~5934)

The `SuperDocHost` component only watches `documentSource` changes:

```javascript
React.useEffect(() => {
  // ... mounts SuperDoc
}, [documentSource]);  // ❌ Only reacts to documentSource, not role!
```

When user switches roles:
- `userStateBridge.role` is updated (line 1557)
- But `SuperDocHost` doesn't re-run its effect
- SuperDoc instance keeps old role/mode

### Issue 2: Missing Event Listener

**Documentation says:** Web client should listen for `superdoc:set-mode` events (see `docs/aiDocs/features/checkin-checkout.md:123`)

**Reality:** No event listener exists in the codebase.

**Expected flow:**
1. React dispatches `superdoc:set-mode` event when role changes
2. Web client listens and remounts SuperDoc
3. But step 1 and 2 are both missing!

### Issue 3: SuperDocBridge.open() Only Called on Document Load

**File:** `web/superdoc-init.js` (line ~385)

`SuperDocBridge.open()` correctly reads role and mode:
```javascript
const userRole = getCurrentRole();
const documentMode = getModeForRole(userRole);
```

But it's only called when:
- Document is first loaded
- Document source changes

It's NOT called when role changes.

## How to Investigate

### Step 1: Verify Role is Being Set

Open browser console and check:

```javascript
// Check current role
console.log('Current role:', window.userStateBridge?.role);

// Switch to suggester in UI, then check again
console.log('After switch:', window.userStateBridge?.role);
```

**Expected:** Should show `'suggester'` after switching

### Step 2: Check SuperDoc Instance Configuration

```javascript
// Check SuperDoc instance
const instance = window.superdocInstance;
console.log('SuperDoc role:', instance?.role);
console.log('SuperDoc documentMode:', instance?.documentMode);
```

**Expected:** Should match `userStateBridge.role` and `getModeForRole(role)`

**Actual:** Likely shows old values (e.g., `role: 'editor'`, `documentMode: 'editing'`)

### Step 3: Verify SuperDoc is in Suggesting Mode

```javascript
// Check if SuperDoc thinks it's in suggesting mode
const instance = window.superdocInstance;
console.log('Is suggesting?', instance?.documentMode === 'suggesting');
console.log('Is role suggester?', instance?.role === 'suggester');
```

**Expected:** Both should be `true` for suggester

### Step 4: Test Track Changes

1. Switch to suggester role
2. Make an edit (type some text)
3. Check if change is tracked:

```javascript
// Check if changes are being tracked
// This depends on SuperDoc's internal API
const instance = window.superdocInstance;
// Look for tracked changes in the editor state
```

**Expected:** Edit should appear as a tracked change (red underline, etc.)

**Actual:** Edit appears as direct change (no tracking)

### Step 5: Check Console Logs

Look for these log messages:

```
🔄 SuperDocBridge.open() - Role: suggester | Mode: suggesting | User: ...
```

**Expected:** Should appear when switching to suggester

**Actual:** Only appears on document load, not on role switch

### Step 6: Verify __IS_DEBUG__ Global

```javascript
console.log('__IS_DEBUG__:', window.__IS_DEBUG__);
```

**Expected:** `false` (required for track changes to work)

**Note:** This is already set in `web/view.html:17`, so this is likely not the issue.

## Debugging Checklist

- [ ] Verify `window.userStateBridge.role` updates when switching roles
- [ ] Check if `SuperDocHost` effect runs when role changes (add console.log)
- [ ] Verify `SuperDocBridge.open()` is called with correct role/mode
- [ ] Check if SuperDoc instance has correct `role` and `documentMode` properties
- [ ] Test if edits are tracked when in suggester role
- [ ] Check browser console for errors
- [ ] Verify `window.__IS_DEBUG__ = false` is set before SuperDoc loads

## Fix Strategy

1. **Make SuperDocHost reactive to role changes:**
   - Add role to dependency array OR
   - Watch `userStateBridge.role` and remount when it changes

2. **Implement superdoc:set-mode event:**
   - Dispatch event when role changes in React
   - Add event listener in web client
   - Remount SuperDoc when event fires

3. **Ensure proper remounting:**
   - Destroy old instance
   - Clear containers
   - Create new instance with correct role/mode

## Related Files

- `shared-ui/components.react.js` - SuperDocHost component, setUser action
- `web/superdoc-init.js` - SuperDocBridge.open(), mountSuperdoc()
- `web/view.html` - Web client entry point
- `docs/aiDocs/features/checkin-checkout.md` - Documentation mentioning superdoc:set-mode
- `docs/fromV2/superdoc-role-and-autoload.md` - Lessons learned about role binding

## Test Cases

1. **Switch to suggester after document loaded:**
   - Load document as editor
   - Switch to suggester role
   - Make edit → should be tracked

2. **Load document as suggester:**
   - Start as suggester role
   - Load document
   - Make edit → should be tracked

3. **Switch between roles:**
   - Editor → Suggester → Editor → Suggester
   - Each switch should remount with correct mode

