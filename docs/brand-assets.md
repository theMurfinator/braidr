# Braidr Brand Assets Audit

## Design Tokens (`:root`) — Official System

### Backgrounds
| Token | Value | Notes |
|---|---|---|
| `--bg-primary` | `#FFFFFF` | |
| `--bg-secondary` | `#F8F8F8` | Hover states |
| `--bg-tertiary` | `#F0F0F0` | Toggles, inputs |

### Text
| Token | Value |
|---|---|
| `--text-primary` | `#1A1A1A` |
| `--text-secondary` | `#6B6B6B` |
| `--text-muted` | `#A0A0A0` |

### Accent
| Token | Value |
|---|---|
| `--accent` | `#2C2C2C` |
| `--accent-hover` | `#1A1A1A` |
| `--accent-light` | `rgba(0,0,0,0.04)` |

### Border / Shadow
| Token | Value |
|---|---|
| `--border` | `#E8E8E8` |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` |
| `--shadow-md` | `0 2px 8px rgba(0,0,0,0.08)` |
| `--shadow-lg` | `0 4px 16px rgba(0,0,0,0.12)` |

### Tag Colors (only defined semantic colors)
| Token | Value | Hue |
|---|---|---|
| `--tag-people` | `#3D8B40` | Green |
| `--tag-locations` | `#3A7BC8` | Blue |
| `--tag-arcs` | `#C44D5E` | Rose |
| `--tag-things` | `#7B4FA2` | Purple |
| `--tag-time` | `#D4820A` | Amber |

### Spacing Scale
| Token | Value |
|---|---|
| `--space-xs` | `4px` |
| `--space-sm` | `8px` |
| `--space-md` | `16px` |
| `--space-lg` | `24px` |
| `--space-xl` | `40px` |
| `--space-2xl` | `64px` |

### Radius Scale
| Token | Value |
|---|---|
| `--radius-sm` | `4px` |
| `--radius-md` | `6px` |
| `--radius-lg` | `10px` |

### Typography Tokens
| Token | Value |
|---|---|
| `--font-ui` | `'DM Sans'` → system-ui sans-serif |
| `--font-body` | `'Literata'` → Georgia serif |
| `--font-scene-title` | `'Literata'` → Georgia serif |
| `--font-section-title` | `'Literata'` → Georgia serif |
| `--font-mono` | `'SF Mono'` → Fira Code → Consolas |

**Note:** Font tokens are user-overridable at runtime — App.tsx applies per-screen font settings to `:root` CSS variables, so `--font-body` etc. are mutable. Literata and DM Sans are the defaults only.

**Google Fonts imported (15 total):** Literata, DM Sans, Lora, PT Serif, Merriweather, Crimson Text, Source Serif 4, Libre Baskerville, EB Garamond, Playfair Display, Bitter, Alegreya, Cormorant Garamond, Spectral. All but Literata and DM Sans are loaded for the font picker in settings.

---

## Off-Token Colors — Hardcoded Throughout CSS

These are the inconsistencies. Major offenders by usage count:

| Color | Count | Where used |
|---|---|---|
| `#3b82f6` (Tailwind blue-500) | 28× | Link highlights, focus rings, selections, active states |
| `#e74c3c` / `#c0392b` / `#dc2626` / `#ef4444` | ~20× | Errors, delete buttons, POV-reordered highlights |
| `#e94560` | 11× | Feature-specific accent (timer / weekly hours area) |
| `#22c55e` / `#16a34a` / `#047857` | ~10× | Success states |
| `#fbbf24` / `#EDE5B4` / `#D4A83A` | ~8× | Yellow remnants from old chapter styling |
| `#8B7355` / `#F5F0E8` / `#E2D9CC` / `#FDFAF6` / `#B0967A` / `#A08060` | 3–5× each | Chapter parchment palette (newly added, off-token) |
| `#6d28d9` / `#8b5cf6` / `#a855f7` | ~5× | Purple (draft branches) |
| `#4b5563` / `#6b7280` / `#9ca3af` | ~7× | Tailwind gray scale |
| ~40 additional unique colors | 1× each | Scattered across various components |

---

## Key Issues

1. **No semantic state tokens** — no `--color-danger`, `--color-success`, `--color-info`, `--color-warning`. Every error/success state picks its own hardcoded color.

2. **Blue is the de facto interactive accent but isn't tokenized** — `#3b82f6` appears 28× for links, focus rings, and active states, but `--accent` in `:root` is charcoal `#2C2C2C` (used for buttons). These are two different accent systems coexisting.

3. **Three competing reds** for destructive/error: `#e74c3c`, `#c0392b`, `#dc2626`, `#ef4444`, `#e94560`.

4. **Chapter parchment palette is entirely off-token** — `#8B7355`, `#F5F0E8`, `#E2D9CC`, `#FDFAF6`, `#B0967A`, `#A08060` were just added for chapter styling and are good candidates to tokenize if that palette is kept.

5. **Yellow remnants** — `#fbbf24`, `#EDE5B4`, `#D4A83A`, `#FFFBEB` etc. are leftover from the old yellow chapter era; should be audited and removed.

---

## Recommended Tokens to Add

If standardizing, the following additions to `:root` would cover ~90% of off-token usage:

```css
/* Interactive / link blue */
--color-interactive: #3b82f6;
--color-interactive-hover: #2563eb;
--color-interactive-bg: rgba(59, 130, 246, 0.08);

/* Semantic states */
--color-danger: #dc2626;
--color-danger-bg: rgba(220, 38, 38, 0.06);
--color-success: #16a34a;
--color-success-bg: rgba(22, 163, 74, 0.08);
--color-warning: #d97706;
--color-warning-bg: rgba(217, 119, 6, 0.08);

/* Chapter / literary palette (if keeping parchment style) */
--chapter-border: #E2D9CC;
--chapter-accent: #8B7355;
--chapter-bg: #FDFAF6;
--chapter-header-bg: #F5F0E8;
--chapter-text-muted: #A08060;
```
