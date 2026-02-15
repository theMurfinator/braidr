# PostHog Analytics — Braidr Tracking Plan

Last updated: 2026-02-15

## PostHog Projects

| Project | Type | Project ID | API Key | Status |
|---------|------|-----------|---------|--------|
| Braidr App | Desktop (Electron) | `TODO: create in PostHog UI` | `TODO` | Setup needed |
| Braidr Web | Website (Next.js) | `TODO: note from existing project` | Already configured in `NEXT_PUBLIC_POSTHOG_KEY` | Active |

---

## App Event Taxonomy (Braidr App project)

### Lifecycle
| Event | Properties | Status |
|-------|-----------|--------|
| `app_opened` | `license_state, app_version, platform` | Implemented |
| `app_closed` | `session_duration_ms` | Implemented |
| `update_downloaded` | `version` | Implemented |

### Navigation
| Event | Properties | Status |
|-------|-----------|--------|
| `screen_viewed` | `screen: pov\|braided\|editor\|notes\|analytics` | Implemented |
| `braided_subview_changed` | `subview: list\|table\|rails` | Implemented |

### Writing
| Event | Properties | Status |
|-------|-----------|--------|
| `writing_session_ended` | `duration_ms, words_net, scene_key, had_checkin, checkin_energy?, checkin_focus?, checkin_mood?` | Implemented |

### Project
| Event | Properties | Status |
|-------|-----------|--------|
| `project_opened` | `character_count, scene_count, total_words` | Implemented |
| `project_created` | `template` | Implemented |

### Content
| Event | Properties | Status |
|-------|-----------|--------|
| `scene_created` | `character_id` | Implemented |
| `scene_deleted` | `character_id` | Implemented |
| `scene_reordered` | `view: pov\|braided` | Implemented |
| `character_created` | — | Implemented |
| `character_deleted` | — | Implemented |

### Features
| Event | Properties | Status |
|-------|-----------|--------|
| `compile_started` | `format: md\|docx\|pdf` | Implemented |
| `tag_created` | `category` | Implemented |
| `note_created` | — | Implemented |
| `search_performed` | `result_count` | Implemented |
| `feedback_submitted` | `category` | Implemented |
| `goal_set` | `type: daily\|project\|deadline` | Implemented |
| `milestone_achieved` | `label, target_words` | Implemented |
| `draft_version_saved` | — | Implemented |
| `backup_created` | — | Implemented |
| `connection_created` | — | Implemented |

### License
| Event | Properties | Status |
|-------|-----------|--------|
| `license_activated` | `state` | Implemented |
| `license_deactivated` | — | Implemented |
| `trial_started` | `trial_days_remaining` | Implemented |
| `purchase_clicked` | — | Implemented |

---

## Web Event Taxonomy (Braidr Web project)

### Custom Events
| Event | Properties | Status |
|-------|-----------|--------|
| `cta_clicked` | `location: nav\|hero\|pricing\|final_cta` | Implemented |
| `scroll_depth` | `percent: 25\|50\|75\|100` | Implemented |

### Auto-captured (PostHog built-in)
| Event | Notes | Status |
|-------|-------|--------|
| `$pageview` | All page views | Active |
| `$pageleave` | Page exits | Active |
| `$autocapture` | Clicks, inputs, form submissions | Active |

### A/B Tests
| Test | Flag Name | Variants | Status |
|------|-----------|----------|--------|
| Hero Headline | `landing-hero-headline` | control, variant-a, variant-b | Running |

---

## Dashboard API Endpoints

| Endpoint | Method | Auth | Returns |
|----------|--------|------|---------|
| `/api/admin/analytics` | GET | `X-Admin-Key` header | App + web PostHog metrics (JSON) |
| `/api/admin/analytics-summary` | GET | `X-Admin-Key` header | Plain-text summary for LLM consumption (`?format=text`) |
| `/api/admin/overview` | GET | `X-Admin-Key` header | Revenue stats + feedback (existing) |

---

## Environment Variables

### Braidr App (Electron, compile-time)
| Variable | Purpose |
|----------|---------|
| `VITE_POSTHOG_KEY` | "Braidr App" PostHog project API key |
| `VITE_POSTHOG_HOST` | PostHog API host (default: `https://us.i.posthog.com`) |

### Braidr Server (Vercel)
| Variable | Purpose |
|----------|---------|
| `POSTHOG_PERSONAL_API_KEY` | Read access to both PostHog projects (for HogQL queries) |
| `POSTHOG_APP_PROJECT_ID` | "Braidr App" project ID |
| `POSTHOG_WEB_PROJECT_ID` | "Braidr Web" project ID |

### Braidr Landing (Vercel, existing)
| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_POSTHOG_KEY` | "Braidr Web" PostHog project API key (already set) |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog API host (already set) |

---

## User Identification (App)

- **Anonymous ID**: `anon_` + SHA-256 of `app.getPath('userData')`, truncated to 16 hex chars
- **On license activation**: `client.alias()` links anonymous ID to `license_` + hashed license key
- **Person properties**: `license_state`, `trial_days_remaining`, `app_version`, `platform`, `os_version`, `customer_email`

---

## Privacy

- Desktop app: opt-out toggle via `localStorage['braidr-telemetry-opt-out']`
- Website: PostHog respects cookie consent banner (opt-out/opt-in)
- No PII sent: no content, file paths, or personal data
- Only counts, durations, feature names, and device metadata

---

## Implementation Checklist

- [x] PostHog core in Electron main process (`posthog.ts`)
- [x] IPC channel + preload bridge for renderer events
- [x] Lifecycle events (app_opened, app_closed, update_downloaded)
- [x] License events (activated, deactivated, trial_started, purchase_clicked)
- [x] Navigation events (screen_viewed, braided_subview_changed)
- [x] Writing events (writing_session_ended)
- [x] Project events (project_opened, project_created)
- [x] Content events (scene_created, scene_deleted, scene_reordered, character_created, character_deleted)
- [x] Feature events (compile, tag, note, search, feedback, goal, milestone, draft, backup, connection)
- [x] Landing site CTA tracking
- [x] Landing site scroll depth tracking
- [x] Cookie consent PostHog integration
- [x] Dashboard analytics API endpoint
- [x] Dashboard analytics-summary API endpoint
- [x] Dashboard UI stat cards (App Analytics + Website Analytics)
- [x] Dashboard visitors bar chart (30-day trend)
- [x] CORS fix (X-Admin-Key header allowed)
- [ ] Create "Braidr App" PostHog project (manual step)
- [ ] Set `VITE_POSTHOG_KEY` in Electron build env (manual step)
- [ ] Set `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_APP_PROJECT_ID`, `POSTHOG_WEB_PROJECT_ID` on Vercel (manual step)
- [ ] Verify app events in PostHog Live Events
- [ ] Verify web events in PostHog Live Events
- [ ] Set up PostHog funnels in UI
