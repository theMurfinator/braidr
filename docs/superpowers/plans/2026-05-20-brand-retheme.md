# Brand Retheme — Luminous Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the "Luminous Workspace" brand guidelines to Braidr's CSS — blue primary gradient, luminous shadows, glassmorphic toolbar, and gradient active-state indicators — without breaking existing functionality.

**Architecture:** All changes are confined to `src/renderer/styles.css` (19,392 lines of CSS custom properties). The approach is additive: introduce new token variables in `:root`, then update the specific rule-sets that drive buttons, active states, shadows, and floating surfaces. No React components need modification.

**Tech Stack:** Pure CSS custom properties, no Tailwind, no build step for CSS. Fonts (Literata, DM Sans) are already imported at line 1.

---

## Background: Current vs. Target

| Element | Current | Target |
|---|---|---|
| Primary button | Charcoal `#2C2C2C` bg, white text | Gradient `#3B82F6 → #14BAFF`, white text |
| Active sidebar indicator | Charcoal `3px` left bar | Blue gradient `3px` left bar |
| Shadows | Neutral black tint | Luminous: slight blue tint + wide blur |
| Surface tones | Pure grays `#F8F8F8`, `#F0F0F0` | Blue-tinted `#F1F4FA`, `#EBEEF4` |
| Border | `#E8E8E8` | `#EEF0F2` |
| Radius (medium) | 6px | 8px |
| Radius (large/modal) | 10px | 16px |
| Toolbar | Solid white, 1px border | Semi-transparent + `backdrop-filter: blur(12px)` |
| Modal overlays | `backdrop-filter: blur(4px)` | `backdrop-filter: blur(12px)` |
| Input focus | `border-color: var(--accent)` (charcoal) | Blue border + soft glow |
| Scene active indicator | None or gray bg | Gradient `3px` left bar |

**Key insight from `docs/brand-assets.md`:** `#3b82f6` (blue) already appears 28× as hardcoded focus/link/active colors in the CSS but is not tokenized. This plan formalizes it as `--color-primary` and extends it to the missing elements.

---

## File Map

All changes are in one file:

| File | Role |
|---|---|
| `src/renderer/styles.css:5-70` | `:root` token block — Task 1 |
| `src/renderer/styles.css:969-1003` | First `.btn-primary`/`.btn-secondary` block — Task 2 |
| `src/renderer/styles.css:1268-1304` | Second `.btn` block — Task 2 |
| `src/renderer/styles.css:9073-9091` | Third `.btn-primary` block — Task 2 |
| `src/renderer/styles.css:180-194` | Sidebar active indicator — Task 3 |
| `src/renderer/styles.css:284-287` | View toggle active — Task 3 |
| `src/renderer/styles.css:334-336` | Icon button active — Task 3 |
| `src/renderer/styles.css:825-828` | Toolbar-btn active — Task 3 |
| `src/renderer/styles.css:946-949` | Sub-view-toggle active — Task 3 |
| `src/renderer/styles.css:8989-9011` | Modal overlay + `.modal` shadow — Task 4 |
| `src/renderer/styles.css:3501-3508` | Tag manager overlay blur — Task 4 |
| `src/renderer/styles.css:461`, `615`, `1343`, `1656`, `1690`, `2144`, `2539`, `2670` | Input focus rules — Task 5 |
| `src/renderer/styles.css:212-222` | `.app-toolbar` — Task 6 |
| `src/renderer/styles.css:4127-4134` | `.braided-scene-item.selected` — Task 7 |

---

## Task 1: Add Brand Tokens to `:root`

**Files:**
- Modify: `src/renderer/styles.css:5-70`

This is the foundation. All subsequent tasks reference these tokens. Make this change first.

- [ ] **Step 1: Open the `:root` block**

Read lines 5-70 of `src/renderer/styles.css` to confirm the current token structure, then make the following edits:

- [ ] **Step 2: Update border, radius, and surface tokens**

Find the existing declarations and replace them with the updated values:

```css
/* BEFORE — lines 8-9 */
  --bg-secondary: #F8F8F8;      /* Hover states only */
  --bg-tertiary: #F0F0F0;       /* Toggles, inputs */

/* AFTER */
  --bg-secondary: #F1F4FA;      /* Hover states — subtle blue tint */
  --bg-tertiary: #EBEEF4;       /* Toggles, inputs — subtle blue tint */
```

```css
/* BEFORE — line 22 */
  --border: #E8E8E8;

/* AFTER */
  --border: #EEF0F2;
```

```css
/* BEFORE — lines 43-45 */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 10px;

/* AFTER */
  --radius-sm: 4px;
  --radius-md: 8px;   /* brand DEFAULT: 0.5rem */
  --radius-lg: 16px;  /* brand lg: 1rem — for modals and large containers */
```

- [ ] **Step 3: Add brand primary color tokens**

Insert the following block immediately after the `--border` line (around line 22), before the tag color vars:

```css
  /* Brand primary — blue interactive system */
  --color-primary: #3B82F6;
  --color-primary-dark: #0058be;
  --color-primary-light: #14BAFF;
  --color-primary-gradient: linear-gradient(135deg, #3B82F6, #14BAFF);
  --color-primary-gradient-subtle: linear-gradient(135deg, rgba(59,130,246,0.12), rgba(20,186,255,0.08));
  --color-primary-bg: rgba(59, 130, 246, 0.08);
  --color-primary-glow: 0 0 0 3px rgba(59, 130, 246, 0.15);
```

- [ ] **Step 4: Add luminous shadow token**

Insert after the existing shadow tokens (after line 50):

```css
  --shadow-luminous: 0 8px 20px rgba(59, 130, 246, 0.04), 0 2px 8px rgba(0, 0, 0, 0.06);
```

- [ ] **Step 5: Verify by running the app**

```bash
cd /Users/brian/braidr && npm run dev
```

Expected: App launches with very slightly blue-tinted sidebars/hover states compared to before. Nothing dramatic yet — surface changes are subtle. Buttons still look the same (that's Task 2).

- [ ] **Step 6: Commit**

```bash
cd /Users/brian/braidr
git add src/renderer/styles.css
git commit -m "style: add Luminous Workspace brand tokens to :root"
```

---

## Task 2: Primary Buttons → Blue Gradient

**Files:**
- Modify: `src/renderer/styles.css:969-1003` (first `.btn-primary` block)
- Modify: `src/renderer/styles.css:1268-1304` (second `.btn` block)
- Modify: `src/renderer/styles.css:9073-9091` (third `.btn-primary` block)

There are three separate `.btn-primary` definitions in the file. All three must be updated. Also update `.btn-secondary` hover in the first two blocks.

- [ ] **Step 1: Update first `.btn-primary` block (lines 981-1003)**

```css
/* BEFORE */
.btn-primary {
  background: var(--text-primary);
  color: var(--bg-primary);
}

.btn-primary:hover {
  background: var(--accent-hover);
}

.btn-secondary {
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.btn-secondary:hover {
  background: var(--bg-secondary);
}

.btn-secondary.active {
  background: var(--bg-tertiary);
  border-color: var(--text-secondary);
}

/* AFTER */
.btn-primary {
  background: var(--color-primary-gradient);
  color: white;
}

.btn-primary:hover {
  filter: brightness(1.08);
}

.btn-secondary {
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.btn-secondary:hover {
  background: var(--color-primary-bg);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.btn-secondary.active {
  background: var(--color-primary-bg);
  border-color: var(--color-primary);
  color: var(--color-primary);
}
```

Also update the `.btn` border-radius in this block (line 969-979):

```css
/* BEFORE */
.btn {
  padding: 9px 18px;
  border-radius: 5px;
  ...
}

/* AFTER */
.btn {
  padding: 9px 18px;
  border-radius: var(--radius-md);   /* 8px */
  ...
}
```

- [ ] **Step 2: Update second `.btn` block (lines 1268-1304)**

```css
/* BEFORE line 1271 */
  border-radius: 6px;

/* AFTER */
  border-radius: var(--radius-md);
```

```css
/* BEFORE lines 1279-1286 */
.btn-primary {
  background: var(--accent);
  color: white;
}

.btn-primary:hover {
  background: var(--accent-hover);
}

/* AFTER */
.btn-primary {
  background: var(--color-primary-gradient);
  color: white;
}

.btn-primary:hover {
  filter: brightness(1.08);
}
```

```css
/* BEFORE lines 1293-1303 */
.btn-secondary {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.btn-secondary:hover {
  background: var(--bg-secondary);
}

/* AFTER */
.btn-secondary {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.btn-secondary:hover {
  background: var(--color-primary-bg);
  border-color: var(--color-primary);
  color: var(--color-primary);
}
```

- [ ] **Step 3: Update third `.btn-primary` block (lines 9073-9091)**

```css
/* BEFORE */
.btn-primary {
  background: var(--accent, #5c6bc0);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm, 6px);
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary:hover:not(:disabled) {
  filter: brightness(1.1);
}

/* AFTER */
.btn-primary {
  background: var(--color-primary-gradient);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary:hover:not(:disabled) {
  filter: brightness(1.08);
}
```

Also update `.toolbar-btn--primary` (lines 831-840) which is the "primary" variant of toolbar buttons:

```css
/* BEFORE */
.toolbar-btn--primary {
  background: var(--text-primary);
  color: white;
}

.toolbar-btn--primary:hover {
  background: var(--text-primary);
  color: white;
  opacity: 0.85;
}

/* AFTER */
.toolbar-btn--primary {
  background: var(--color-primary-gradient);
  color: white;
}

.toolbar-btn--primary:hover {
  filter: brightness(1.08);
  opacity: 1;
}
```

- [ ] **Step 4: Verify**

```bash
cd /Users/brian/braidr && npm run dev
```

Expected: All primary buttons (e.g., "Save", "Create", "Export") now show the blue-to-light-blue gradient. Secondary buttons turn blue-tinted on hover. If any button looks wrong, identify which class it uses and check if there's a 4th `.btn-primary` definition further in the file.

- [ ] **Step 5: Commit**

```bash
cd /Users/brian/braidr
git add src/renderer/styles.css
git commit -m "style: primary buttons use blue gradient, secondary hover uses blue tint"
```

---

## Task 3: Active State Indicators → Blue

**Files:**
- Modify: `src/renderer/styles.css:180-194` (sidebar active btn + indicator bar)
- Modify: `src/renderer/styles.css:284-287` (view toggle active)
- Modify: `src/renderer/styles.css:334-336` (icon btn active)
- Modify: `src/renderer/styles.css:825-828` (toolbar-btn active)
- Modify: `src/renderer/styles.css:946-949` (sub-view-toggle active)

- [ ] **Step 1: Sidebar active button + indicator bar (lines 180-194)**

```css
/* BEFORE */
.app-sidebar-btn.active {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}

.app-sidebar-btn.active::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 18px;
  border-radius: 0 2px 2px 0;
  background: var(--text-primary);
}

/* AFTER */
.app-sidebar-btn.active {
  color: var(--color-primary);
  background: var(--color-primary-bg);
}

.app-sidebar-btn.active::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 18px;
  border-radius: 0 2px 2px 0;
  background: var(--color-primary-gradient);
}
```

- [ ] **Step 2: View toggle active (lines 284-287)**

```css
/* BEFORE */
.view-toggle button.active {
  background: var(--bg-primary);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}

/* AFTER */
.view-toggle button.active {
  background: var(--bg-primary);
  color: var(--color-primary);
  box-shadow: var(--shadow-sm);
  font-weight: 600;
}
```

- [ ] **Step 3: Icon button active (lines 334-336)**

```css
/* BEFORE */
.icon-btn:hover,
.icon-btn.active {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

/* AFTER */
.icon-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.icon-btn.active {
  background: var(--color-primary-bg);
  color: var(--color-primary);
}
```

- [ ] **Step 4: Toolbar-btn active (lines 825-828)**

```css
/* BEFORE */
.toolbar-btn.active {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-weight: 600;
}

/* AFTER */
.toolbar-btn.active {
  background: var(--color-primary-bg);
  color: var(--color-primary);
  font-weight: 600;
}
```

- [ ] **Step 5: Sub-view-toggle active (lines 946-949)**

```css
/* BEFORE */
.sub-view-toggle button.active {
  background: var(--bg-primary);
  color: var(--text-primary);
}

/* AFTER */
.sub-view-toggle button.active {
  background: var(--bg-primary);
  color: var(--color-primary);
  font-weight: 600;
}
```

- [ ] **Step 6: Verify**

```bash
cd /Users/brian/braidr && npm run dev
```

Expected: The left sidebar icon for the current view shows a blue gradient left-edge bar and blue-tinted background. View toggle (List/Rails/Table) shows the active button in blue text. Icon buttons (e.g., toolbar icons) glow blue when active.

- [ ] **Step 7: Commit**

```bash
cd /Users/brian/braidr
git add src/renderer/styles.css
git commit -m "style: active state indicators use blue — sidebar bar, view toggle, icon btns"
```

---

## Task 4: Luminous Shadows + Modal Backdrop Blur

**Files:**
- Modify: `src/renderer/styles.css:48-50` (shadow tokens in `:root`)
- Modify: `src/renderer/styles.css:8989-9011` (modal overlay + `.modal`)
- Modify: `src/renderer/styles.css:3501-3513` (tag manager overlay)

- [ ] **Step 1: Update shadow tokens in `:root` (lines 48-50)**

```css
/* BEFORE */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.12);

/* AFTER */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(59, 130, 246, 0.04);
  --shadow-lg: 0 8px 20px rgba(59, 130, 246, 0.06), 0 4px 12px rgba(0, 0, 0, 0.08);
```

Note: `--shadow-luminous` was added in Task 1. `--shadow-lg` is now the same concept and replaces it on modals.

- [ ] **Step 2: Update modal overlay and `.modal` (lines 8989-9011)**

```css
/* BEFORE */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  padding: 0;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
}

/* AFTER */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  padding: 0;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--border);
}
```

- [ ] **Step 3: Update tag manager overlay (lines 3501-3513)**

```css
/* BEFORE */
.tag-manager-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

/* AFTER */
.tag-manager-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
```

- [ ] **Step 4: Verify**

```bash
cd /Users/brian/braidr && npm run dev
```

Expected: Open any modal (e.g., Character Manager, Tag Manager). The overlay behind the modal should be more visibly frosted/blurred. The modal itself should have a subtle blue-tinted shadow. Cards and dropdowns that use `--shadow-md`/`--shadow-lg` will also pick up the luminous shadow automatically.

- [ ] **Step 5: Commit**

```bash
cd /Users/brian/braidr
git add src/renderer/styles.css
git commit -m "style: luminous shadows and 12px backdrop blur on modal overlays"
```

---

## Task 5: Input Focus → Blue Ring

**Files:**
- Modify: `src/renderer/styles.css` — the 8+ specific `:focus` rules and add a global fallback

The current pattern is `border-color: var(--accent)` on focus, where `--accent` is charcoal. The target is a blue border + soft glow. Rather than hunting every `:focus` rule across 19k lines, add a global rule near the top of the file (after `:root`) that catches all inputs, then update the most prominent specific rules.

- [ ] **Step 1: Add global input focus rule**

Find the `/* App layout */` comment block (around line 88) and insert this rule immediately before it:

```css
/* Global input focus — blue ring */
input:focus,
input:focus-visible,
select:focus,
select:focus-visible,
textarea:focus,
textarea:focus-visible {
  outline: none;
  border-color: var(--color-primary) !important;
  box-shadow: var(--color-primary-glow) !important;
}
```

Note: The `!important` is needed because many individual `:focus` rules in the file override specificity. This is acceptable here — focus styling is a global brand concern.

- [ ] **Step 2: Update the most prominent specific focus rules**

Update `line 1343` (form-group input):

```css
/* BEFORE */
.form-group input[type="text"]:focus {
  outline: none;
  border-color: var(--accent);
}

/* AFTER */
.form-group input[type="text"]:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: var(--color-primary-glow);
}
```

Update `line 461` (editor manual time input focus):

Read lines 461-464 first, then replace `var(--accent)` with `var(--color-primary)` and add `box-shadow: var(--color-primary-glow)`.

Update `line 615` (time-track-session-input focus):

Same pattern — replace accent with primary and add glow.

- [ ] **Step 3: Verify**

```bash
cd /Users/brian/braidr && npm run dev
```

Expected: Click into any text field, date input, or select. The field border turns blue and a soft blue glow ring appears. Previously it turned charcoal on focus.

- [ ] **Step 4: Commit**

```bash
cd /Users/brian/braidr
git add src/renderer/styles.css
git commit -m "style: input focus states use blue border and glow ring"
```

---

## Task 6: Toolbar Glassmorphism

**Files:**
- Modify: `src/renderer/styles.css:212-222` (`.app-toolbar`)

The top app toolbar sits above scrollable content. Making it semi-transparent with backdrop-blur creates the "floating navigation bar" glassmorphism the spec calls for.

- [ ] **Step 1: Update `.app-toolbar` (lines 212-222)**

```css
/* BEFORE */
.app-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 16px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border);
  -webkit-app-region: drag;
  gap: 16px;
}

/* AFTER */
.app-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 16px;
  background: rgba(247, 249, 255, 0.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(238, 240, 242, 0.7);
  -webkit-app-region: drag;
  gap: 16px;
  position: sticky;
  top: 0;
  z-index: 10;
}
```

Note: The `position: sticky; top: 0; z-index: 10` ensures the blur effect is visible as content scrolls underneath. The background color `rgba(247, 249, 255, 0.88)` is the brand's `surface` color (`#f7f9ff`) at 88% opacity — enough transparency to see scroll content through it.

- [ ] **Step 2: Verify**

```bash
cd /Users/brian/braidr && npm run dev
```

Expected: The top toolbar has a frosted-glass appearance. When you scroll a long scene list or notes list, you can see content blurring behind the toolbar rather than the toolbar being opaque white. The toolbar text/buttons remain fully legible.

If the `-webkit-app-region: drag` conflicts with `position: sticky`, the app may not respond to dragging the toolbar to move the window. If this occurs, revert the `position: sticky` line only — the glassmorphism itself does not require it.

- [ ] **Step 3: Commit**

```bash
cd /Users/brian/braidr
git add src/renderer/styles.css
git commit -m "style: app toolbar gets glassmorphic backdrop blur"
```

---

## Task 7: Scene List Active Indicator — Gradient Left Bar

**Files:**
- Modify: `src/renderer/styles.css:4127-4134` (`.braided-scene-item.selected`)

The brand spec calls for "a vertical indicator line on the left using the brand gradient to mark the Active scene." Currently the braided list view selected state only changes background. This task adds the gradient left bar.

- [ ] **Step 1: Update `.braided-scene-item.selected` (lines 4127-4134)**

```css
/* BEFORE */
.braided-scene-item.selected {
  background: var(--bg-secondary);
  border-color: rgba(0, 0, 0, 0.1);
}

.braided-scene-item.selected .scene-card {
  border-color: transparent;
}

/* AFTER */
.braided-scene-item.selected {
  background: var(--color-primary-bg);
  border-color: transparent;
  position: relative;
}

.braided-scene-item.selected::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background: var(--color-primary-gradient);
  pointer-events: none;
}

.braided-scene-item.selected .scene-card {
  border-color: transparent;
}
```

- [ ] **Step 2: Verify**

```bash
cd /Users/brian/braidr && npm run dev
```

Expected: Go to the Braided Timeline List view. Click a scene to select it. The selected scene card should show a blue gradient left-edge bar (like a bookmark) and a very subtle blue-tinted background.

Check that the left bar doesn't interfere with the drag handle, which sits at the left edge of the card. If the bar overlaps the drag handle area, reduce `width: 3px` to `width: 2px` or adjust `left: 0` to `-2px`.

- [ ] **Step 3: Commit**

```bash
cd /Users/brian/braidr
git add src/renderer/styles.css
git commit -m "style: selected scene in braided list shows gradient left indicator bar"
```

---

## Self-Review Checklist

**Spec coverage:**

| Brand requirement | Covered |
|---|---|
| Blue `#3B82F6` as primary interactive | ✅ Task 1 (token) + Task 3 (active states) |
| Gradient `#3B82F6 → #14BAFF` on primary buttons | ✅ Task 2 |
| Layered white surface strategy (blue-tinted secondaries) | ✅ Task 1 (`--bg-secondary`, `--bg-tertiary`) |
| Luminous shadow (blue-tinted, wide blur) | ✅ Tasks 1 + 4 |
| Glassmorphism on floating nav bars | ✅ Task 6 (toolbar) |
| Glassmorphism on modal overlays | ✅ Task 4 |
| Input focus: blue border + glow | ✅ Task 5 |
| Scene list active gradient left bar | ✅ Task 7 |
| Active sidebar indicator → gradient | ✅ Task 3 |
| Border color update to `#EEF0F2` | ✅ Task 1 |
| Radius updates (8px standard, 16px modal) | ✅ Task 1 + Task 2 |
| Literata / DM Sans typography | Already in codebase — no action needed |

**Items not covered (out of scope for this retheme):**

- Semantic state tokens (`--color-danger`, etc.) — `docs/brand-assets.md` recommends this but the brand guidelines don't specifically require it. Tackle in a separate cleanup.
- Chapter parchment palette tokenization — separate concern.
- Yellow remnant cleanup — separate concern.
- Secondary toolbar (`651`) glassmorphism — the brand spec focuses on the top nav; the secondary toolbar should remain solid for now.

**Placeholder scan:** No TBD or vague instructions — all steps include exact line numbers and complete CSS blocks.

**Type consistency:** All tasks reference the same token names established in Task 1 (`--color-primary`, `--color-primary-gradient`, `--color-primary-bg`, `--color-primary-glow`, `--shadow-lg`).
