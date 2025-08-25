# Branding CSS Spec — Phase 1 (Remove Inline Styles)

## Goal
- Replace inline colors/borders/shadows/radii/spacing with classes that use CSS variables hydrated from `theme.json`.
- Keep React behavior unchanged. Visual parity required.

## Non‑goals
- No component refactors (Button/Modal primitives can come in Phase 2).
- No new routes or runtime changes beyond CSS variable hydration in existing pages.

## CSS variables (authoritative names)
Hydrate these variables at `:root` from `/api/v1/theme` (fallbacks in parentheses):
- Surfaces
  - `--surface-base` ← `modal.background` (`#ffffff`)
  - `--surface-muted` ← `surface.muted` or (`#f5f5f5`)
- Borders & text
  - `--color-border` ← `modal.border` (`#e5e7eb`)
  - `--color-text-strong` ← `modal.headerFg` (`#111827`)
  - `--color-text-muted` ← `modal.muted` (`#6b7280`)
- Buttons
  - `--button-primary-bg` ← `buttons.primary.bg` (`#111827`)
  - `--button-primary-fg` ← `buttons.primary.fg` (`#ffffff`)
  - `--button-primary-border` ← `buttons.primary.border` (`#111827`)
  - `--button-secondary-bg` ← `buttons.secondary.bg` (`#ffffff`)
  - `--button-secondary-fg` ← `buttons.secondary.fg` (`#111827`)
  - `--button-secondary-border` ← `buttons.secondary.border` (`#e5e7eb`)
- Pills/Badges
  - `--pill-role-bg` (`#fde68a`)
  - `--pill-role-fg` (`#92400e`)
  - `--pill-role-border` (`#fbbf24`)
  - `--badge-bg` (fallback `#fafafa`)
- Overlay & elevation
  - `--overlay-scrim` (`rgba(0,0,0,0.45)`)
  - `--shadow-modal` (`0 10px 25px rgba(0,0,0,0.2)`) 
- Radii
  - `--radii-sm: 4px`, `--radii-md: 6px`, `--radii-lg: 8px`, `--radii-xl: 10px`, `--radii-pill: 999px`
- Spacing
  - `--spacing-xs: 2px`, `--spacing-sm: 4px`, `--spacing-md: 6px`, `--spacing-lg: 8px`, `--spacing-xl: 12px`

Minimal hydration snippet (reuse across Web and Taskpane):
```html
<script>
(async function hydrateTheme(){
  try{
    const r = await fetch('/api/v1/theme'); if(!r.ok) return; const t = await r.json();
    const rt = document.documentElement.style;
    const m = t.modal||{}; const b = (t.buttons||{}); const p=b.primary||{}; const s=b.secondary||{}; const surf=t.surface||{};
    if(m.background) rt.setProperty('--surface-base', m.background);
    rt.setProperty('--surface-muted', surf.muted||'#f5f5f5');
    rt.setProperty('--color-border', m.border||'#e5e7eb');
    rt.setProperty('--color-text-strong', m.headerFg||'#111827');
    rt.setProperty('--color-text-muted', m.muted||'#6b7280');
    rt.setProperty('--button-primary-bg', p.bg||'#111827');
    rt.setProperty('--button-primary-fg', p.fg||'#ffffff');
    rt.setProperty('--button-primary-border', p.border||'#111827');
    rt.setProperty('--button-secondary-bg', s.bg||'#ffffff');
    rt.setProperty('--button-secondary-fg', s.fg||'#111827');
    rt.setProperty('--button-secondary-border', s.border||'#e5e7eb');
    rt.setProperty('--overlay-scrim', 'rgba(0,0,0,0.45)');
    rt.setProperty('--shadow-modal', '0 10px 25px rgba(0,0,0,0.2)');
  }catch(e){}
})();
</script>
```

## Base classes (single stylesheet)
Define once and reuse. Example rules:
```css
.badge { display:inline-block; padding: 2px 6px; border: 1px solid var(--color-border); border-radius: var(--radii-xl); font-size: 12px; background: var(--badge-bg, var(--surface-muted)); color: var(--color-text-strong); }
.pill-role { background: var(--pill-role-bg); color: var(--pill-role-fg); border: 1px solid var(--pill-role-border); border-radius: var(--radii-pill); padding: 2px 8px; font-size: 11px; font-weight: 700; }
.btn { padding: 6px 10px; border-radius: var(--radii-sm); border: 1px solid var(--button-secondary-border); background: var(--button-secondary-bg); color: var(--button-secondary-fg); }
.btn--primary { background: var(--button-primary-bg); color: var(--button-primary-fg); border-color: var(--button-primary-border); }
.card { background: var(--surface-base); border: 1px solid var(--color-border); border-radius: var(--radii-lg); padding: var(--spacing-lg); }
.modal { background: var(--surface-base); border: 1px solid var(--color-border); border-radius: var(--radii-lg); box-shadow: var(--shadow-modal); }
.modal__hdr { padding: 14px 16px; border-bottom: 1px solid var(--color-border); display:flex; align-items:center; justify-content:space-between; color: var(--color-text-strong); }
.modal__bd { padding: var(--spacing-lg); }
.modal__ft { padding: var(--spacing-md) var(--spacing-lg); border-top: 1px solid var(--color-border); display:flex; justify-content:flex-end; gap: var(--spacing-md); }
.panel-muted { background: var(--surface-muted); border: 1px solid var(--color-border); border-radius: var(--radii-sm); }
```

## Before → After examples
... (content duplicated)

## Search/replace checklist
... (content duplicated)

## Lint rule (guardrail)
... (content duplicated)

## Rollout plan
... (content duplicated)

## Acceptance
... (content duplicated)

## Alignment with canonical React Button baseline
... (content duplicated)
