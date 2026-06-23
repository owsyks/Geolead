# GeoLead AI — Flagship UI/UX Build Prompt (v2 "Aurora Terminal")

> Build a full-stack, dark-first SaaS platform for geo-domain investors that feels like a **premium investment terminal fused with an AI co-pilot**. This prompt specifies the design system, motion language, signature moments, component library, and every screen. Hand it to a designer or an AI agent to build the entire interface. Goal: a product that makes a sophisticated investor say "this looks like money" in the first three seconds, and stays effortless at high data density.

---

## 0. NORTH STAR

**Name:** *Aurora Terminal* — a calm, confident, data-dense command surface lit by living teal→copper aurora.

**Vision:** GeoLead AI is where a domain investor runs their entire operation — discover leads, judge domains, launch compliant outreach, and triage replies — in one keyboard-first cockpit that feels alive, intelligent, and expensive. Bloomberg's density, Linear's polish, Raycast's speed, Stripe's trust.

**Tagline:** *Find. Connect. Close.*

### Design Principles
1. **Density without noise.** Pack information; remove ink. Every pixel either informs or guides — never decorates for its own sake.
2. **The data is the hero.** Numbers, scores, and live events are the art. Chrome recedes; signal advances.
3. **Alive, not animated.** Motion communicates state and causality. If a motion doesn't explain something, cut it.
4. **AI as a trusted co-pilot, not a chatbot.** AI is woven inline, always shows its confidence and its reasoning, and is always editable.
5. **Keyboard-first, mouse-friendly.** A power user should never have to reach for the mouse. Everything has a shortcut.
6. **Premium restraint.** One accent system, generous spacing inside dense cards, no gradients-on-gradients, no casino. Glow is a seasoning, not a sauce.
7. **Trust is a feature.** Compliance, provenance, and deliverability are visible and reassuring — never buried.

---

## 1. DESIGN LANGUAGE & VISUAL SYSTEM

### 1.1 Aesthetic
Modern dark-first SaaS, "fintech / investment platform" energy. Warm coffee-black canvas, glassy stone panels, a single teal brand accent with copper as the secondary, and slow aurora glows in the deep background. Confident, premium, technical. Never playful, never skeuomorphic.

Both light and dark fully supported; **dark is the hero**. Theme persists to `localStorage` and respects `prefers-color-scheme` on first load. The theme toggle does a 250ms cross-fade (no harsh flip).

### 1.2 Color System (tokens)

Use HSL-based semantic tokens, not raw hex sprinkled in components.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#0c0a09` (warm coffee-black) | `#ffffff` | App canvas |
| `--bg-elevated` | `#0f0d0c` | `#fafaf9` | Raised regions |
| `--surface` | `#1c1917` @ 72% + blur | `#fafaf9` | Cards/panels (glass) |
| `--surface-2` | `#211e1b` | `#f5f5f4` | Nested cards, table headers |
| `--border` | `#292524` | `#e7e5e4` | Hairline borders |
| `--border-strong` | `#3a3531` | `#d6d3d1` | Focus/active borders |
| `--text` | `#fafaf9` | `#0c0a09` | Primary text |
| `--text-muted` | `#a8a29e` | `#78716c` | Metadata, labels |
| `--text-faint` | `#6b645e` | `#a8a29e` | Disabled, hints |
| `--brand` | `#14b8a6` (teal-500) → hover `#0f766e` | same | Primary actions, active nav |
| `--brand-soft` | `rgba(20,184,166,0.12)` | `rgba(20,184,166,0.10)` | Active/selected tints |
| `--copper` | `#d97706` | same | Secondary accent, warnings |
| `--copper-soft` | `rgba(217,119,6,0.12)` | same | Warning tints |
| `--success` | `#10b981` emerald | `#059669` | Verified, delivered, opened |
| `--danger` | `#f43f5e` / `#dc2626` | `#dc2626` | Bounced, failed, AVOID |
| `--info` | `#38bdf8` | `#0284c7` | Clicked, neutral info, LinkedIn |
| **Gradient** | `linear-gradient(110deg,#14b8a6,#d97706)` | same | Brand seams, premium borders |
| **Aurora** | radial blobs of `rgba(20,184,166,.14)` + `rgba(217,119,6,.08)`, 120px blur | same | Ambient background |

**Semantic scales:** every status keyword maps to a `{fg, bg, border}` triad so badges, dots, rows, and chart series stay consistent everywhere:
`open/delivered → emerald`, `click → sky/info`, `sent → teal`, `bounce/fail → red`, `unsub/paused/warn → copper`, `neutral/speculative → stone`.

**Score color ramp** (used for priority/match/intent scores): `≥85 copper-gold`, `70–84 teal`, `50–69 stone`, `<50 faint`. Always pair color with the number — never color alone (accessibility).

### 1.3 Surfaces, Depth & Materials
- **Elevation tokens:** `e0` flat (canvas), `e1` card (`0 1px 0 rgba(255,255,255,.03) inset, 0 8px 32px rgba(0,0,0,.37)`), `e2` popover/modal (`0 24px 64px rgba(0,0,0,.5)`), `e3` dragging (lifts + brand ring).
- **Glass:** `.glass` = `--surface` translucency + `backdrop-filter: blur(16px) saturate(140%)` + a 1px top **specular edge** (`linear-gradient` hairline at the top border catching light).
- **Grain:** a single tiled SVG noise overlay at ~3% opacity over the canvas, so flat dark areas don't band. One layer, app-wide.
- **Aurora background:** 2–3 blurred radial blobs (teal + copper) drifting on an **18s** ease-in-out loop, parallax-dampened on scroll. Subtle; barely perceptible; gives the black depth.
- **Hover lift:** cards rise `translateY(-2px)` + gain a `--brand` border + a faint glow ring (`0 0 0 1px brand, 0 8px 24px rgba(20,184,166,.18)`).

### 1.4 Typography
- **Font:** Geist (sans) for UI; **Geist Mono** for emails, code, IDs, IPs, tokens, and **all KPI/score numbers** (tabular figures, `font-variant-numeric: tabular-nums`).
- **Scale:** Page title `font-black 900 / 22–26px / -0.02em`; section title `700 / 15px`; body `14px`; dense metadata `12–13px`; **eyebrow** `11px / UPPERCASE / +0.12em / muted`; KPI number `28px / 800 / mono / tabular`.
- Antialiased; ligatures + contextual alternates on. Truncate with `…` and tooltip the full value.

### 1.5 Shape, Spacing, Radius
- **Radius:** `8px` cards/buttons, `12px` nested, `16px` modals, `full` pills/avatars.
- **Spacing scale:** 4 / 8 / 12 / 16 / 24 / 32. Dense rows use 8–12px vertical padding; cards use 16–20px internal padding even when dense (breathing room is the premium signal).
- **Hairlines:** 1px borders everywhere; never heavy strokes. Separation comes from value contrast, not thick lines.

---

## 2. MOTION SYSTEM

Motion explains state and causality. Default to physics, not linear tweens.

- **Easing tokens:** `--ease-out` `cubic-bezier(.16,1,.3,1)` (entrances), `--ease-inout` `cubic-bezier(.65,0,.35,1)` (moves), spring `stiffness 320 / damping 30` for drag & interactive elements.
- **Durations:** micro `120ms` (hover/press), standard `220ms` (cards/menus), page `320ms`, ambient `8–18s` (aurora/glow).
- **Stagger:** list & table rows reveal with a `24ms` per-row stagger, fading up `8px`. Caps at ~12 rows then snaps.
- **Count-ups:** KPI numbers animate from a baseline to value over `600ms` ease-out on first paint and when they change (tabular mono prevents width jitter).
- **Press feedback:** buttons scale `0.97` on `:active`, spring back.
- **Skeleton → content:** skeletons shimmer (teal-tinted) then cross-fade to real content; never a hard pop.
- **Reduced motion:** `prefers-reduced-motion` disables aurora drift, count-ups, stagger, and parallax — replaced by instant fades. Every signature moment has a static fallback.

### Signature motions (named — reuse these everywhere)
- **`activityPulse`** — a new Live Activity event slides in from the top, briefly ring-glows in its event color, then settles; the feed gently pushes down.
- **`scoreReveal`** — a score's ring sweeps from 0→value and the number counts up in sync.
- **`scanline`** — email verification & DNS checks render a teal scanline passing over the list as each item resolves to ✅/⚠️/❌.
- **`tierStamp`** — an AI verdict (STRONG_BUY etc.) lands like a stamp: scale `1.15→1` with a soft impact and a one-time glow.
- **`launch`** — activating a campaign triggers a brief upward particle/gradient sweep and a toast "Outreach live."
- **`streamCaret`** — AI-generated text streams in token-by-token behind a blinking copper caret.

---

## 3. SIGNATURE "WOW" MOMENTS (the screenshot-worthy hero experiences)

1. **The Trading Floor (Live Activity).** On Overview, the right rail is a living feed of outreach events streaming over WebSocket — each event flies in with `activityPulse`, color-coded by type (OPENED emerald, CLICKED sky, BOUNCED red, UNSUBSCRIBED copper), tagged with the variant letter (A–E), business name, email, and truncated subject. It feels like watching a trading desk. Capped at 8, newest first, with a tiny live "●" heartbeat in the header.
2. **AI Verdict Stamp (Acquisition).** Paste up to 100 domains, hit scan, and watch results resolve one-by-one with `tierStamp` — STRONG_BUY / BUY / WATCHLIST / SPECULATIVE / AVOID — each with a confidence ring and a one-line AI rationale that expands into full reasoning. Cinematic, decisive, trustworthy.
3. **The Scan (Email Verification).** A theatrical overlay: a teal `scanline` sweeps the recipient list while "Checking MX, SPF/DMARC, SMTP handshake…" streams, each row flipping to ✅ Valid / ⚠️ Risky / ❌ Invalid in real time. Turns a boring job into proof of rigor.
4. **Geo Pulse.** Because these are *geo* domains, surface a subtle map dimension: lead locations and campaign targets shown as pulsing points on a dark minimal map (Overview widget + Lead Explorer toggle). Investors instantly feel the "geo" in geo-domain.
5. **Score Rings everywhere.** Priority, match, buyer-intent, and decision-maker scores render as compact radial rings with `scoreReveal` — legible at a glance, beautiful in aggregate.
6. **Co-Pilot Spotlight (⌘K + AI).** A single command palette that also accepts natural language: "draft a friendly follow-up for Dallas leads", "show campaigns with reply rate over 5%". It routes to actions, navigation, search, or AI — one surface to run the whole app.
7. **Campaign Launch.** Activating a campaign plays the `launch` moment and drops a confetti-free, tasteful gradient sweep + "Outreach live" toast with the throttle and sender summary.
8. **Reply & Sale celebrations.** A new interested reply or a recorded domain sale triggers a restrained, premium micro-moment (a brief copper bloom + sound-off by default) — earned delight, never spammy.

---

## 4. AI-NATIVE LAYER

AI is present everywhere as a calm co-pilot — never a bolted-on chat bubble.

- **Persistent Co-Pilot rail/panel** (toggle with `⌘J`): context-aware. On a lead it offers "explain this score," "draft outreach," "find the decision-maker." On a domain it offers valuation and buyer strategy. On the inbox it drafts replies.
- **Inline affordances:** every AI number has a `ⓘ explain` affordance that opens a popover with the reasoning and the inputs that drove it. Every AI suggestion is **editable** before use.
- **Confidence & provenance:** AI outputs always show a confidence indicator (ring or 0–100) and source provenance (e.g., "LinkedIn verified," "from 14 reviews"). Investors must trust the numbers — show the work.
- **Generative UI:** email generation, suggested replies, and chat all stream with `streamCaret`. Show partial results immediately; never a spinner-only wait.
- **Agentic flows:** kicking off lead discovery or an acquisition scan shows a live "agent working" state with progress, current step, and the ability to pause/stop — you watch it work.
- **Smart defaults:** forms pre-fill from the selected portfolio domain (niche, city, geo) so the user rarely types.

---

## 5. POWER-USER BACKBONE

- **Command Palette (`⌘K` / `Ctrl+K`):** fuzzy actions + navigation + entity search + natural-language AI. Recent + suggested actions on open. The single most important interaction in the app.
- **Global shortcuts:** `g then o/p/d/c/i` jump to Overview/Portfolio/Dashboard/Campaigns/Inbox; `c` compose/quick-send; `/` focus search/filter; `⌘J` co-pilot; `?` shortcut cheat-sheet; `j/k` move row selection; `x` toggle select; `e` edit inline; `Esc` close panes. Show shortcuts in tooltips and menus.
- **Layout system:** fixed 288px sidebar + sticky blurred header + content. Power screens (Lead Explorer, Inbox) use a **multi-pane** layout (list ↔ detail) with a `\` **focus mode** that collapses the sidebar for full-bleed work.
- **Density toggle:** Comfortable / Compact row heights, persisted per user.
- **Saved views:** any filter combination on Lead Explorer/Portfolio/Inbox can be saved as a named view and pinned.

---

## 6. APP FRAME

**Two-zone shell on every logged-in page.**

### Sidebar (288px, glass, hairline right border)
- **Brand block:** `[GL]` badge (teal, 36px rounded square, subtle inner light) + "GeoLead AI" (`font-black`) + "Find. Connect. Close." (11px muted).
- **Nav list — 14 items**, 40px rows, 16px lucide icon + label. Active = `--brand-soft` bg + 1px brand border + brand text + a 2px brand indicator on the left edge. Inactive = muted, hover lightens to `--surface-2`. A live "●" appears on Inbox/Overview when new real-time events arrive.
- **Footer:** theme toggle; **Compliance Guardrails** card (emerald-tinted, shield icon — "Opt-outs, sender limits, suppression & truthful copy enforced by default"); user card (avatar + name + email + sign-out).

**Nav:** 1 Overview `/` · 2 Portfolio `/portfolio` · 3 Sales Kanban `/portfolio/kanban` · 4 Acquisition Advisor `/acquisition` · 5 Watchlist `/watchlist` · 6 Lead Explorer `/dashboard` · 7 Campaigns `/campaigns` · 8 Quick Send `/quick-send` · 9 AI Generator `/ai-email-generator` · 10 Inbox `/inbox` · 11 Analytics `/analytics` · 12 Senders `/sender-accounts` · 13 Templates `/templates` · 14 Settings `/settings`.

### Header (sticky, `blur(16px)`, hairline bottom)
- **Left:** eyebrow "✉ AI outbound email automation" + H1 page title (`font-black`) + muted subtitle.
- **Right:** page-specific action buttons, a `⌘K` launcher chip, notification bell (red unread badge, polls unread-count every 60s), theme toggle.
- **Mobile:** sidebar becomes a horizontal scrolling chip bar under the header; panes stack.

### Auth (`AuthShell`)
Centered `rounded-2xl` glass card on a dark aurora background, logo + "GeoLead AI" on top, title + muted subtitle, stacked labeled fields, full-width teal submit. Pages: Login, Register, Forgot Password, Reset Password, Verify Email, Profile.

---

## 7. CORE COMPONENT LIBRARY

| Component | Anatomy & elevated detail | States |
|---|---|---|
| **MetricCard** | Eyebrow label (11px uppercase muted) → big mono tabular number (28px, `count-up`) → optional delta/helper line (▲/▼ colored). Optional sparkline. 2–4 col grids. | loading (shimmer), empty ("—"), trend up/down |
| **ScoreRing** | Compact radial ring (sweeps with `scoreReveal`) + centered number, colored by the score ramp. Sizes sm/md. | n/a / loading |
| **StatusBadge** | `rounded-full` pill, 11px bold, semantic `{fg,bg,border}` triad by keyword. Dot variant for tables. | per status |
| **GlassCard** | Translucent + blur + specular top edge. Hover: brand border + glow ring + 2px lift. | default/hover/selected/dragging |
| **Modal** | Centered `rounded-2xl` glass over dim+blur backdrop; titled; ESC + click-out close; focus-trapped. `max-w-2xl` regular, `max-w-4xl` events. | enter/exit spring |
| **DataTable rows** | Compact, hairline-separated; inline badges; circular icon-buttons appear on row hover; `j/k` keyboard nav; select-all + per-row checkbox; sticky header. | hover/selected/editing |
| **FilterBar** | Horizontal row of select dropdowns + toggle buttons + search input; overflow into a "More filters" popover; active filters shown as removable chips; "Save view." | default/active |
| **FormField** | Labeled, `rounded-lg`, `--surface-2` bg, brand focus ring, inline validation, helper/error text. Full-width teal submit. | focus/error/disabled |
| **Tabs** | Pill tabs with an animated brand underline/indicator that slides between tabs. | active/hover |
| **CommandPalette** | `⌘K` overlay: fuzzy list, grouped (Actions/Go to/Search/Ask AI), keyboard-driven, recent + suggested. | open/empty/AI-streaming |
| **CoPilotPanel** | Right panel/rail, context-aware AI with streaming, editable suggestions, confidence + provenance. | idle/thinking/streaming |
| **Toast** | Bottom-right glass toast, semantic accent, auto-dismiss, action link; stacks. | success/error/info |
| **EmptyState** | Centered glass card, bold title + muted body + primary CTA. | n/a |
| **Drawer/SplitPane** | Slide-in detail pane for multi-pane screens; resizable; `Esc` closes. | open/closed |

---

## 8. PAGE-BY-PAGE SPECIFICATION

> Keep **every** feature below. Elevate the interaction and visuals; never remove capability.

### 8.1 Overview (`/`) — "Outbound Command Center"
**3-column grid.** *Signature moment: The Trading Floor + Geo Pulse.*
- **Left (2/3):** 4 **MetricCards** (Campaigns, Active, Queued, Engagement Score %) with count-ups + sparklines. **Hottest campaign** card (name, domain, open/click/reply %, link to Campaigns). **Top leads** card (8 rows: business, email count, domain-match ring, priority ring; link to Lead Explorer). Optional **Geo Pulse** mini-map of active targets.
- **Right (1/3):** **Live Activity** feed (WebSocket + REST, `activityPulse`, color-coded event badge, variant letter, campaign, business · email, truncated subject, relative time, max 8 newest-first, live heartbeat). **Deliverability Alerts** (copper-tinted, actionable: "SPF/DKIM needed," "bounce rate high," with a fix CTA).
- **Empty:** "No campaigns yet. Create one to start scheduling respectful outreach." + CTA.

### 8.2 Portfolio (`/portfolio`)
**Header:** "Domain Portfolio" + [Add Domain] [Import] [Export]. *Signature: a scannable wall of value.*
- **Stats row:** Total domains, Portfolio value, Investment, Revenue, Profit, ROI, Expiring, Active campaigns, Leads, Replies, Domains sold — as MetricCards (ROI/profit colored by sign).
- **Domain table:** Domain (bold) · Status pill · Purchase date/price · Registrar · Expiration (copper if <30d) · Category · Niche · Branding score (ring) · Estimated value · Buyer demand · Tags. Row actions on hover: Edit inline, Archive, Record sale. **Bulk:** multi-select → change status / add tag.
- **Add/Edit modal:** Name, Status (Available/Prospecting/Contacting Buyers/Negotiating/Sold/Archived), Purchase date, Purchase price, Registrar, Expiration, Category, Niche, Industry, City/State/Country, Tags, Target industries, Target locations, Notes.
- **Import:** CSV/TXT/JSON upload with field mapping. **Filters:** search (name/tags), Status, Category, Sort (name/value/date/score). **Empty/offline** states handled.

### 8.3 Sales Kanban (`/portfolio/kanban`)
**6 drag columns:** Available → Prospecting → Contacting Buyers → Negotiating → Sold → Archived. *Signature: buttery spring drag.*
- Cards show domain, niche, estimated-value badge, lead count. Drag uses spring physics + `e3` lift; drop syncs status app-wide with an optimistic update + toast. Column headers show count + total value.

### 8.4 Acquisition Advisor (`/acquisition`)
*Signature: AI Verdict Stamp.*
- **Input:** paste domain list (newline/comma, max 100) + Bulk scan. Live agent progress while scanning (polls every 3s up to 4 min).
- **Results:** 5 tiers color-coded — STRONG_BUY emerald / BUY teal / WATCHLIST copper / SPECULATIVE stone / AVOID red. Each card: domain, `tierStamp` tier badge, confidence ring, AI rationale paragraph, expand for full analysis. Actions: Add to portfolio, Add to watchlist.
- **Investor Chat:** per-domain AI chat — "What's this worth?", "Who would buy this?", "Exit strategy?" — streaming answers with provenance.

### 8.5 Watchlist (`/watchlist`)
- **Tabs:** All / Available / High Priority / Reminders / Notifications (animated indicator).
- **List:** domain · priority dot (CRITICAL/HIGH/MEDIUM/LOW) · AI rec badge (BUY_NOW/WAIT/MONITOR/AVOID) · registration status · registrar · expiration · last checked. **Per-domain:** Check DNS now (`scanline`), Add reminder, Move to portfolio.
- **Reminders panel:** triggers (time-based days, status change, availability) + notify IN_APP/EMAIL/BOTH. **Notifications panel:** read/unread, priority (URGENT/HIGH/NORMAL), mark-all-read.

### 8.6 Lead Explorer (`/dashboard`) — THE POWER SCREEN
**Multi-pane: left rail + main; supports focus mode (`\`).** *Signature: dense, fast, score-ring-rich table + the Scan.*

**Left rail — Search + History**
- **Search form:** Domain Idea (auto-filled from Domain Selector), Keyword Niche, City/State, Search Depth slider (1–200), [Start Lead Discovery] (teal). **Domain Selector** dropdown shows portfolio domains (name, niche, city/state, status badge) → click auto-fills.
- **Task history:** cards with Domain, Keyword, Status badge (PROCESSING=copper pulse, COMPLETED=emerald, FAILED=red, PAUSED=copper, CANCELLED=stone). PROCESSING shows a live progress bar (polls every 3s). PENDING/PROCESSING → [Pause][Stop]; PAUSED → [Resume][Stop]. Click loads its leads.

**Main**
- **Header:** ← [GL] + "Campaign: {domain}" + "Target Keyword: … · Search depth: X sites." Live **scraping progress bar** when PENDING/PROCESSING.
- **Completed stats:** Total Prospects, Validated Emails, Avg Match Score, High-Priority Leads (MetricCards).
- **Filter bar:** search (name/keyword/city), Min Score (All/>50/>75/>90), Has Email toggle, Channel (All/WhatsApp High/Email/Phone/Multi), Role (All/CEOs & Founders/Founders Only/Directors), Buyer Intent (Any/High ≥65/Moderate ≥45), Priority (All/High ≥75/Medium ≥50), [Not Contacted] toggle, [Bulk (N)] → Set Stage / Mark Contacted. Active filters as removable chips; Save view.
- **Header buttons:** [Verify Emails] (emerald) [Validate WA] (green) [Export Data] (teal) [Create Campaign (N)] (red).
- **Lead table (columns):**
  - **☐** select + select-all.
  - **Business Details:** name (bold), [CEO] badge (copper if DM score ≥85, teal ≥70, else stone), [in] LinkedIn badge (info-blue if verified → profile), company-size badge, website link, location, Google Maps link, pipeline-stage badge, tags.
  - **Contact Info:** best-channel badge (WhatsApp First/Email First/Call First/Web Form), email row: mailto + VALID/RISKY pill + [CEO] badge if DM + Send button (opens composer), phone numbers.
  - **Score:** **Priority ScoreRing** (large, copper ≥85 / emerald ≥65) + Domain Match % (small ring) + Decision-Maker card (name bold, role, DM score) + buyer-intent (BI) & domain-fit (DF) mini badges + contact-strategy badge (📧 DM / 📧 Gen / 📞 Call / 🌐 Form) + WhatsApp score.
  - **CRM Notes:** inline editable textarea (autosave, `e` to edit).
- **Pagination:** Page N of M, ← →.
- **Modals:**
  - **Verification:** overlay with `scanline` progress + scrolling per-email status (✅/⚠️/❌) + "Verifying N emails…" + subtitle "Checking MX records, SPF/DMARC, and SMTP handshake." Streams (polls ~300ms; job poll 2s).
  - **WhatsApp Validation:** summary row (HIGH/MEDIUM/LOW counts) + filterable list with phone numbers, score badges, WA deep-link buttons per number. Loads ALL leads for the task.
  - **Export Options:** format (CSV/XLSX/JSON), "One row per email" checkbox, "Include risky emails" checkbox; shows included column groups (Decision maker, LinkedIn, Buyer scores, Contact strategy, Email verification, CRM notes).
  - **Solo-Send Composer:** recipient (pre-filled), sender selector, subject, body, Send/Cancel.
  - **Campaign Creation (from selected):** name (auto: domain), Daily limit (5/10/20/50), Create/Cancel.

### 8.7 Campaigns (`/campaigns`)
**Two columns: Create form (left) + Kanban (right).** *Signature: Campaign Launch.*
- **Create form:** Domain Selector, name (auto: domain + " Outreach"), Geo domain (auto), Niche/Category (auto), City/State (auto), Tone (Professional/Friendly/Persuasive), Objective textarea, **Throttle presets** (8 buttons: Instant, Every 1/5/15/30 min, 1hr, 4hr, Custom) + daily cap, Sender selector, Template selector (optional), **Lead selection** (domain-scope toggle, checkbox list with name/location/match%/email count, Select all / Clear all, or CSV email upload), [Create campaign] (teal).
- **Kanban — 4 columns:** DRAFT / ACTIVE / PAUSED / COMPLETED. **Card:** name (bold), geo domain, engagement score, 3-col stats (sent/open/reply), engagement bar, **next-follow-up countdown** ("Next follow-up: 2d 14h" — copper if <24h, green if now). Actions:
  - ACTIVE: [Pause] [Queue] [Force] [Variants] [Events] [Delete]
  - PAUSED: [Resume] [Queue] [Force] [Variants] [Events] [Delete]
  - DRAFT: [Activate] [Delete] · COMPLETED: [Delete]
  - Activating plays `launch`.
- **Variants modal:** 5 cards (A–E): key badge, style name (Direct/Consultative/Branding/SEO/Opportunity), subject, body preview, spam score, approved/rejected badge. [Generate/Regenerate] (copper) → AI creates 5 distinct variants (different subjects/greetings/CTAs/signatures).
- **Events modal (full-detail):** 6-col stat bar (📨 sent / ✅ delivered / 👁 opened / 🖱 clicked / ❌ bounced / 🔕 unsub). Filter chips (All/Opened/Bounced/Unsub/Clicked). **Expandable event cards:** compact row (business, variant letter, status pill, email, subject, open count 👁 3×, sent date, expand) → expanded 4-col timeline (Sent time+date / Delivered time+✓ / Opened time+count+"last:" / Clicked time+count) + bounce detail (red box, timestamp, error) + IPs + From address.

### 8.8 Quick Send (`/quick-send`)
Single clean compose: From (sender dropdown), To, Subject, Body. [Send] + result banner (success/failure). `c` opens it from anywhere.

### 8.9 AI Email Generator (`/ai-email-generator`)
**Form:** Domain (auto), Category, Niche, City/State, Sender name, Website, Pain points (textarea), Tone, Language, Variant (cold/follow_up/short/long/persuasive/friendly). **[Generate Email]** → streams (`streamCaret`) subject, preview text, body, 3 follow-ups, 3 A/B subject alternatives, spam score, deliverability score, compliance notes. **Rewrite actions:** Make shorter / More professional / More persuasive / More friendly. **Copy** (subject/body/full) + **Save as template.**

### 8.10 Inbox (`/inbox`)
**Multi-pane: reply list ↔ detail.** *Signature: AI-triaged replies + live new-reply pulse.*
- **Filters:** All / Unread / Interested / Negotiating / Not Interested / Archived / Sold.
- **Reply list:** business name, sent-from email, subject, **AI category badge** (Interested emerald / Negotiating teal / Spam red / Unsubscribe copper), sentiment, intent score (ring), received time. New replies arrive over WebSocket with `activityPulse` + optional desktop notification.
- **Reply detail panel:** full thread (email logs + replies + events), AI summary (category, sentiment, intent, tags), **AI suggested response** (editable, streaming), actions: Mark Interested, Mark Not Interested, Archive, Create Reminder.
- **IMAP config:** host, port, SSL, username, app password, last-sync status, [Sync Now]. **WebSocket:** NEW_REPLY + INBOX_SYNCED live; Web Notification API.

### 8.11 Analytics (`/analytics`)
**Overview metrics:** Campaigns, Active, Queued, Sent, Open/Click/Reply/Bounce rates (MetricCards). **Daily snapshots chart:** sent/delivered/opens/clicks/replies/bounces by day (semantic series colors, animated draw-in, hover tooltips). **Top templates** (by deliverability). **Best subject lines** (by send count). **AI send-time suggestions** (optimal windows + confidence). **Domain recommendations.** **AI insights** (natural-language, actionable, with a "do it" CTA where possible).

### 8.12 Senders (`/sender-accounts`)
**List:** Label, Provider (DRY_RUN/RESEND/SMTP/SENDGRID), From name, From email, Reply-to, Status (active/inactive/pending), Daily/Hourly limits, **Warmup progress** (bar), SPF/DKIM/DMARC status (verified/pending/unknown chips), Deliverability score bar, Bounce rate, Spam-complaint rate. **Add/Edit modal:** Label, Provider, From name/email, Reply-to, Daily/Hourly limits, Timezone, Send window start/end, Provider config (encrypted — Resend key, SMTP host/port/user/pass…), Warmup toggle. **[Verify DNS]** per sender → `scanline` check returns SPF/DKIM/DMARC + deliverability score.

### 8.13 Templates (`/templates`)
**List:** Name, Type (cold/follow_up), Language, Tone, Spam score, Deliverability score, Tags. **Form:** Name, Type, Purpose, Language, Tone, Subject (merge tokens `{{businessName}}` `{{geoDomain}}` `{{decisionMakerName}}` with autocomplete), Preview text, Body, Follow-up body, Tags. **Aggregate stats:** avg spam, avg deliverability, AI-ready count. Live token preview pane.

### 8.14 Settings (`/settings`)
**Sectioned:** General, AI, Discovery, Email, SMTP, Branding, Notifications, Integrations — each with icon + title + description + provider display. **Secret fields:** masked; only send touched fields (never overwrite stored secrets with dots). **[Test]** per provider (live connection test with result chip). **Last 5 audit logs** (entity, action, user, time). **Recent webhook events** (provider, type, processed, summary). **Suppression list** (manual entries with reason + source).

### 8.15 Portfolio Detail (`/portfolio/[id]`)
**Two tabs:** Overview + Intelligence (animated indicator).
- **Overview:** Status dropdown, purchase info, registrar, expiration; Buyer list (+ add); Offer log (+ record offer); Sale record; Linked campaigns.
- **Intelligence:** AI valuation — keyword parsing, brand breakdown (memorability/relevance/commercial/geo as rings), competition score, estimated buyer pool, value range (conservative/expected/premium shown as a gradient band), recommendation (hold/contact_buyers/increase_price/reduce_price). **Investor Chat** streaming with provenance.

---

## 9. GLOBAL BEHAVIORS

### Real-time (`/ws/outbound`)
Custom raw WebSocket (no library). Broadcast: CAMPAIGN_STATUS, CAMPAIGN_DELETED, EMAILS_QUEUED, INBOX_SYNCED, NEW_REPLY, SENT, OPENED, CLICKED, BOUNCED. Each event carries emailLogId, campaignId, toEmail, subject, variant, businessName. Frontend merges into Live Activity (cap 8) and pulses the relevant nav dot. Overview connects on mount, auto-reconnects on error with backoff.

### Notifications
Header bell with red unread badge; polls `/api/watchlist/notifications/unread-count` every 60s; desktop notifications for new replies (Web Notification API, permission-gated).

### Polling cadences
Lead task progress 3s (while PENDING/PROCESSING) · email verify stream 300ms · verify job 2s · acquisition scan 3s up to 4 min · watchlist notifications 60s. Respect rate limits by backing off.

### Offline / Demo fallback
Every data page catches errors and falls back to hardcoded demo data behind a copper banner: "Backend offline. Showing demo data." + [Retry Connection].

### Rate limiting
In-memory fixed-window per-endpoint buckets: `/api/leads` 300/10min, `/api/export` 20/10min, `/api/email/verify` 120/10min. Frontend reduces polling frequency near limits.

### Compliance (first-class, always visible)
Every outgoing email includes a physical mailing address, an unsubscribe link, and truthful sender identity. Opt-out tokens in every email. Suppression list permanently blocks bounced + unsubscribed addresses. Sidebar guardrails card states this plainly. Compliance status is reassuring, never hidden.

---

## 10. DATA MODELS (key fields)

**Lead:** businessName, website, location, googleMapsLink, category, rating, reviewsCount, phoneNumbers, socialLinks, domainMatchScore(0–100), scoreExplanation, decisionMakerName/Role/Score(0–100)/Email, buyerIntentScore, domainUpgradeScore, businessQualityScore, priorityScore, contactStrategy, buyerInsights(JSON: linkedinUrl, linkedinVerified, linkedinConfidence, aiSummary), engagementScore, open/reply/clickCount, whatsappScore, whatsappConfidence, bestContactChannel, contactChannelScores, leadStatus, pipelineStage, tags[], notes, companySize, lastContactedAt, doNotContact, unsubscribed.

**Campaign:** name, geoDomain, niche, cityState, objective, tone, language, status(DRAFT/ACTIVE/PAUSED/COMPLETED), dailyLimit, smartDelayMin/Max, sendWindowStart/End, timezone, metadata(JSON: variants bundle, compliance, instant flag, senderAccountId).

**EmailLog:** toEmail, fromEmail, subject, bodyText, bodyHtml, variant(A–E), status(QUEUED/SENT/DELIVERED/OPENED/CLICKED/REPLIED/BOUNCED/UNSUBSCRIBED/COMPLAINT), trackingToken, unsubscribeToken, scheduledAt, sentAt, deliveredAt, openedAt, clickedAt, bouncedAt, unsubscribedAt, errorMessage, metadata(JSON).

**Campaign Variants (5, A–E in campaign.metadata.variants):** key, style(Direct/Consultative/Branding/SEO/Opportunity), subject, greeting, body, cta, signature, spamScore(0–10), approved(bool), flags[].

---

## 11. TASTE GUARDRAILS (do NOT)
- No rainbow gradients, no neon-on-neon, no glow on every element — glow is reserved for live/active states.
- No motion that doesn't explain something; no parallax/aurora when `prefers-reduced-motion`.
- No color-only meaning — always pair with text/number/icon.
- No AI output without confidence + provenance + an edit path.
- No hidden compliance — opt-out and suppression are always one click and always visible.
- No dead ends — every empty state has a primary action; every error has a retry.
- Keep dense, but keep 16px+ internal card padding — cramped ≠ premium.
