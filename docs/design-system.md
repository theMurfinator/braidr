# Braidr Design System

Instructions for Claude Code: Read this file at the start of any session that touches UI. Every color, font, spacing, and component decision should use the tokens defined here. Do not introduce new values — extend the token system if needed and document additions in this file.

## Design Philosophy

White background. Black text. Minimal chrome. Power accessible but not foregrounded. Calm, restrained, content-forward. Obsidian/Notion aesthetic — the writing is what matters, not the interface.

- Side panels over hard navigation transitions
- Hover reveals over permanent controls
- Blue (`--color-primary`) for interactive/selected states only — not decoration
- Literata for content. DM Sans for UI chrome. Never reversed.

---

## Color Tokens

All tokens are CSS custom properties defined in `:root` in `styles.css`.

### Backgrounds

```css
--bg-primary: #FFFFFF;          /* Main content area, cards, panels */
--bg-secondary: #F1F4FA;        /* Sidebar, toolbar, hover states */
--bg-tertiary: #EBEEF4;         /* Toggle tracks, inputs, pressed states */
```

### Text

```css
--text-primary: #1A1A1A;        /* Body text, titles, scene content */
--text-secondary: #6B6B6B;      /* Labels, metadata, secondary info */
--text-muted: #A0A0A0;          /* Placeholders, timestamps, hint text */
```

### Accent (Charcoal)

```css
--accent: #2C2C2C;              /* Hover accent on text-level actions */
--accent-hover: #1A1A1A;
--accent-light: rgba(0, 0, 0, 0.04);
```

### Brand Blue (Interactive System)

Used exclusively for: selected/active states, focus rings, primary actions, progress indicators.

```css
--color-primary: #3B82F6;
--color-primary-dark: #0058BE;
--color-primary-light: #14BAFF;
--color-primary-gradient: linear-gradient(135deg, #3B82F6, #14BAFF);
--color-primary-gradient-subtle: linear-gradient(135deg, rgba(59,130,246,0.12), rgba(20,186,255,0.08));
--color-primary-bg: rgba(59, 130, 246, 0.08);   /* Active button background */
--color-primary-glow: 0 0 0 3px rgba(59, 130, 246, 0.15); /* Focus ring */
```

### Border

```css
--border: #EEF0F2;              /* All dividers, panel edges, card separators */
```

### Tag Colors

```css
--tag-people: #3D8B40;
--tag-locations: #3A7BC8;
--tag-arcs: #C44D5E;
--tag-things: #7B4FA2;
--tag-time: #D4820A;
```

### Danger (inline only, not a token)

```css
/* Destructive hover: background #fde8e8, color #e74c3c */
/* Use only on delete/remove actions, revealed on hover */
```

---

## Typography

Two fonts. No others.

| Role | Font | Use |
|------|------|-----|
| Literata | Editorial serif | Scene titles, section titles, body prose, all content |
| DM Sans | UI sans-serif | All chrome: labels, buttons, metadata, toolbar text, dropdowns |
| SF Mono / Fira Code | Monospace | Code only |

### Font Variables

```css
--font-section-title: 'Literata', Georgia, serif;
--font-section-title-size: 18px;
--font-section-title-weight: 600;

--font-scene-title: 'Literata', Georgia, serif;
--font-scene-title-size: 16px;
--font-scene-title-weight: 500;

--font-body: 'Literata', Georgia, serif;
--font-body-size: 16px;
--font-body-weight: 400;

--font-ui: 'DM Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
--font-mono: 'SF Mono', 'Fira Code', 'Consolas', monospace;
```

### Type Scale (UI — DM Sans)

| Size | Weight | Case | Use |
|------|--------|------|-----|
| 10px | 600 | uppercase / letter-spacing 0.5px | Section labels, count badges |
| 11px | 400–600 | — | Timestamps, metadata, small labels |
| 12px | 500 | — | Toolbar buttons, toggles, pills |
| 12.5px | 500 | — | Sidebar labels, account text |
| 13px | 400–500 | — | Dropdown items, form inputs |
| 14px | 600 | — | Toolbar title (h1) |

---

## Spacing Scale

```css
--space-xs: 4px;
--space-sm: 8px;
--space-md: 16px;
--space-lg: 24px;
--space-xl: 40px;
--space-2xl: 64px;
```

**Common fixed dimensions:**
- App sidebar (collapsed): 76px
- App sidebar (expanded on hover): 156px
- App toolbar height: 52px
- Icon button size: 28×28px
- Sidebar nav button: 38×38px
- Detail panel header padding: 20px 24px

---

## Border Radius Scale

```css
--radius-sm: 4px;    /* Inputs, small buttons, badges */
--radius-md: 8px;    /* Dropdowns, panels, standard buttons */
--radius-lg: 16px;   /* Modals, large containers */
```

Sidebar nav buttons: 8px. Toggles/pills: 20px (fully rounded).

---

## Shadow Scale

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md: 0 2px 8px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(59, 130, 246, 0.04);
--shadow-lg: 0 8px 20px rgba(59, 130, 246, 0.06), 0 4px 12px rgba(0, 0, 0, 0.08);
--shadow-luminous: 0 8px 20px rgba(59, 130, 246, 0.04), 0 2px 8px rgba(0, 0, 0, 0.06);
```

Use `--shadow-sm` for subtle elevation (active toggle). `--shadow-lg` for floating panels and dropdowns.

---

## Component Patterns

### App Shell

```
[76px fixed sidebar] [flex-1 body: toolbar (52px) + content area]
```

- Sidebar: `background: var(--bg-secondary)`, `border-right: 1px solid var(--border)`
- Body: `background: var(--bg-primary)`
- Toolbar: `background: var(--bg-secondary)`, `border-bottom: 1px solid var(--border)`

### Sidebar Nav Button (`.app-sidebar-btn`)

```css
width: 38px; height: 38px;
border: none; background: transparent;
border-radius: 8px;
color: var(--text-muted);
font-family: var(--font-ui);
```

States:
- Hover: `color: var(--text-secondary)`, `background: var(--bg-tertiary)`
- Active: `color: var(--color-primary)`, `background: var(--color-primary-bg)` + left-edge indicator (3×18px, gradient, border-radius: 0 2px 2px 0)

### Icon Button (`.icon-btn`)

28×28px, transparent background, `border-radius: 5px`, `color: var(--text-secondary)`.

States:
- Hover: `background: var(--bg-secondary)`, `color: var(--text-primary)`
- Active: `background: var(--color-primary-bg)`, `color: var(--color-primary)`
- Disabled: `opacity: 0.3`, no hover effect

### Toolbar Button (`.toolbar-btn`)

```css
padding: 6px 12px;
border: none; background: transparent;
color: var(--text-secondary);
font-size: 12px; font-weight: 500;
border-radius: 5px;
font-family: var(--font-ui);
```

States:
- Hover: `background: var(--bg-tertiary)`, `color: var(--accent)`
- Active: `background: var(--color-primary-bg)`, `color: var(--color-primary)`, `font-weight: 600`
- Primary: `background: var(--color-primary-gradient)`, `color: white`

### View Toggle (`.view-toggle`)

Container: `background: var(--bg-tertiary)`, `border-radius: 6px`, `padding: 3px`.
Buttons: `padding: 6px 16px`, `font-size: 12px`, `font-weight: 500`.
Active button: `background: var(--bg-primary)`, `color: var(--color-primary)`, `font-weight: 600`, `box-shadow: var(--shadow-sm)`.

### Scene Card (`.scene-card`)

```css
background: var(--bg-primary);
padding: 18px 0;
border: none;
border-bottom: 1px solid rgba(0, 0, 0, 0.06);
border-radius: 0;
```

- Content is row-based: [drag gutter 20px] [scene number 30px min-width] [scene content flex-1]
- Hover reveals drag handle and action buttons (`opacity: 0` → visible on hover)
- Scene number: `font-size: 15px`, `font-weight: 700`, `color: var(--text-secondary)`
- Scene title: uses `--font-scene-title` variables

### Detail Panel (`.scene-detail-panel`)

```css
background: var(--bg-primary);
border-left: 1px solid var(--border);
```

Panel header:
- `padding: 20px 24px`
- `border-bottom: 1px solid var(--border)`
- Sticky, with subtle gradient: `linear-gradient(180deg, #FDFCFA 0%, var(--bg-primary) 100%)`
- Character name: `font-size: 19px`, `font-weight: 700`, `font-family: var(--font-section-title)`
- Metadata labels: `font-size: 11–12px`, `color: var(--text-muted)`, `font-family: var(--font-ui)`

### Dropdown / Floating Panel

```css
background: var(--bg-primary);
border: 1px solid var(--border);
border-radius: var(--radius-md);
box-shadow: var(--shadow-lg);
padding: 4px;
```

Menu items: `padding: 8px 12px`, `font-size: 13px`, `font-family: var(--font-ui)`, `color: var(--text-secondary)`. Hover: `background: var(--bg-secondary)`, `color: var(--text-primary)`. Dividers: `height: 1px`, `background: var(--border)`, `margin: 4px 8px`.

### Pill / Badge Button

```css
padding: 3px 10px;
border: 1px solid var(--border);
border-radius: 20px;
background: var(--bg-secondary);
font-size: 11px;
font-family: var(--font-ui);
color: var(--text-secondary);
```

Hover: `background: var(--bg-tertiary)`, `border-color: var(--text-muted)`.

### Form Inputs

```css
padding: 7px 10px;
border: 1px solid var(--border);
border-radius: 5px;
background: var(--bg-primary);
color: var(--text-primary);
font-size: 13px;
font-family: var(--font-ui);
```

Focus: `border-color: var(--color-primary)`, `box-shadow: var(--color-primary-glow)`, `outline: none`.

### Section Labels (UI Pattern)

Used for panel section headers throughout the app:

```css
font-size: 10px;
font-weight: 600;
font-family: var(--font-ui);
color: var(--text-muted);
text-transform: uppercase;
letter-spacing: 0.5px;
```

---

## Interaction Timing

- Standard transitions: `0.15s ease`
- Sidebar expand: `0.2s ease`, with `transition-delay: 0.15s` on hover
- Hover-reveal elements (drag handles, action buttons): `opacity 0.15s ease`
- Save indicator fade: `2s ease-out`

---

## Rules for Claude Code

1. **Never hardcode hex values** in component files. Always use a CSS variable from this system.
2. **Never introduce a new font.** Literata for content, DM Sans for UI. Full stop.
3. **Hover reveals, not permanent controls.** Secondary actions (delete, duplicate, drag) should be `opacity: 0` and revealed on parent hover.
4. **Blue is for interaction, not decoration.** `--color-primary` and its variants are reserved for selected/active/focus states. Don't use them for visual interest.
5. **Side panels, not page transitions.** Detail views open in a panel alongside the list, not by replacing it.
6. **Borders are `--border` only.** `#EEF0F2`. Do not use darker borders for emphasis — use background changes or spacing instead.
7. **When in doubt, check this file before adding a value.** If you need something not here, ask before inventing it.
