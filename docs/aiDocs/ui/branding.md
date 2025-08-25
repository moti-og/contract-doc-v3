# Branding Guide (Prototype)

## Purpose
- Define a lightweight, centralized brand system for the prototype so Web and Word taskpane look cohesive.
- Align UI with `data/app/theme.json` tokens; avoid hardcoded colors in clients.

## Brand tokens (from theme.json)
- Banner states: `final`, `checked_out_self`, `checked_out_other`, `available`
- Modal: `background`, `headerBg`, `headerFg`, `border`, `primary`, `muted`
- Buttons: `primary`, `secondary`

Example (current):
```json
{
  "banner": {
    "final": { "bg": "linear-gradient(180deg,#b91c1c,#ef4444)", "fg": "#ffffff", "pillBg": "#7f1d1d", "pillFg": "#ffffff" },
    "checked_out_self": { "bg": "linear-gradient(180deg,#2563eb,#60a5fa)", "fg": "#ffffff", "pillBg": "#1e3a8a", "pillFg": "#ffffff" },
    "checked_out_other": { "bg": "linear-gradient(180deg,#b45309,#f59e0b)", "fg": "#111827", "pillBg": "#92400e", "pillFg": "#ffffff" },
    "available": { "bg": "linear-gradient(180deg,#16a34a,#4ade80)", "fg": "#ffffff", "pillBg": "#166534", "pillFg": "#ffffff" }
  },
  "modal": {
    "background": "#ffffff",
    "headerBg": "#ffffff",
    "headerFg": "#111827",
    "border": "#e5e7eb",
    "primary": "#111827",
    "muted": "#6b7280"
  },
  "buttons": {
    "primary": { "bg": "#111827", "fg": "#ffffff", "border": "#111827" },
    "secondary": { "bg": "#ffffff", "fg": "#111827", "border": "#e5e7eb" }
  }
}
```

## Style inventory (extracted from current UI)
... (content duplicated)

## Token mapping (what to use instead of hardcoded values)
... (content duplicated)

## Proposed theme.json extensions (non-breaking)
... (content duplicated)

## Hardcoded color inventory → token mapping
... (content duplicated)

## Feature adoption matrix
... (content duplicated)

## Phase 1 (focused): remove inline styles via CSS variables
... (content duplicated)

## Adoption checklist (apps should do this)
... (content duplicated)

## Notes for Word add-in
... (content duplicated)

## Future
... (content duplicated)
