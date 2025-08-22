# Feature: Back to OpenGov (Rickroll)

## Summary
- Purpose: a playful placeholder for the “Take Me Back to OpenGov” button that opens a React modal titled “We’re not going back. We’re going forward!” and auto‑plays the Rickroll video.
- Scope: client‑only UX in both Web and Word add‑in; no server state mutation.
- Presentation: non‑fullscreen panel (e.g., 640–720px wide, `max-width: 95vw`) centered over a translucent overlay.
- Source video: `https://www.youtube.com/watch?v=oHg5SJYRHA0`

## State Matrix
- Flag: `buttons.openGovBtn`
- Availability: enabled by server feature toggles (see the State Matrix guide). If disabled/omitted, the button is hidden.
- Side‑effects: none on `serverState`; purely UI.

## UX Flow
1) The Actions grid renders “Back to OpenGov” when `config.buttons.openGovBtn` is true.
2) On click, open a modal with the title: “We’re not going back. We’re going forward!”.
3) Inside the modal, auto‑play the Rickroll video in an embedded player.
4) Close button dismisses the modal and stops playback (remove the iframe to stop audio).

## Implementation Details

### Client (Web and Word add‑in)
- Location: React shared UI (`shared-ui/components.react.js`).
- Wiring:
  - Show the action when `config.buttons.openGovBtn` is true.
  - On click, open a React modal (not fullscreen) via `window.openReactModal('open-gov')` or equivalent local state.
  - Inside the modal, render a responsive 16:9 `<iframe>` that autoplays the embed.
  - On modal close, unmount/remove the `<iframe>` so playback stops.

Example (illustrative):
```javascript
// Add button (React layer)
add('Back to OpenGov', () => window.openReactModal?.('open-gov'), !!config.buttons.openGovBtn);

// Modal panel (non-fullscreen)
function OpenGovModal({ onClose }) {
  const title = "We're not going back. We're going forward!";
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }} onClick={(e)=>{ if(e.target===e.currentTarget) onClose?.(); }}>
      <div style={{ width:720, maxWidth:'95vw', background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, boxShadow:'0 10px 25px rgba(0,0,0,0.2)', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid #e5e7eb', display:'flex', justifyContent:'space-between' }}>
          <div style={{ fontWeight:700 }}>{title}</div>
          <button onClick={()=>onClose?.()} style={{ border:'none', background:'transparent' }}>✕</button>
        </div>
        <div style={{ padding:'0 16px 16px 16px' }}>
          <div style={{ position:'relative', paddingTop:'56.25%', borderRadius:6, overflow:'hidden', background:'#000' }}>
            <iframe
              src="https://www.youtube.com/embed/oHg5SJYRHA0?autoplay=1&rel=0&modestbranding=1"
              allow="autoplay; encrypted-media"
              allowFullScreen
              title="Rickroll"
              style={{ position:'absolute', inset:0, width:'100%', height:'100%', border:0 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
```

### Suggested embed (YouTube)
- URL (embed): `https://www.youtube.com/embed/oHg5SJYRHA0?autoplay=1&rel=0&modestbranding=1`
- Attributes: `allow="autoplay; encrypted-media"`, `allowfullscreen`
- Sizing: 16:9 responsive container (e.g., wrapper with `position:relative; padding-top:56.25%` and iframe `position:absolute; inset:0; width:100%; height:100%`).

### Autoplay considerations
- Autoplay generally works because it is triggered by a user click. If a browser blocks audio autoplay, the first click can also toggle mute→unmute.
- Fallback (if embeds are restricted): open the video in a new tab: `window.open('https://www.youtube.com/watch?v=oHg5SJYRHA0', '_blank', 'noopener')`.

### Word add‑in notes
- The taskpane is a browser surface; the same React modal + iframe approach applies.
- If an add‑in CSP or network policy blocks YouTube iframes, use the fallback to open a new tab/window instead.

## Testing
- Button gating: when `openGovBtn` is false/missing, the button is hidden.
- Click behavior: opens modal (not fullscreen), shows correct title, starts playback automatically.
- Close behavior: closing the modal stops playback (iframe removed/unmounted).
- Parity: verify behavior in both Web host (`web/view.html`) and Word taskpane.

## Telemetry (optional)
- Client event: `openGov.click` and `openGov.play` events to measure engagement.

## References
- State Matrix button catalog: `openGovBtn` (see `docs/state-matrix-plain-english.md`).
- Video: Rick Astley — Never Gonna Give You Up (`https://www.youtube.com/watch?v=oHg5SJYRHA0`).


