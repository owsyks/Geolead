# GeoLead AI — Website / App Design Specification

> A visual + structural design brief. Hand this to a designer or another AI to
> picture exactly how the product looks and feels. It describes the **as-built**
> interface (Next.js + Tailwind CSS app).

---

## 1. Product in one line

**GeoLead AI — "Find. Connect. Close."**
An AI-powered platform for **geo-domain investors / outbound sellers**: discover
local businesses (leads), enrich them with AI + LinkedIn intelligence, run
compliant cold-email campaigns, triage replies in a unified inbox, and manage a
domain portfolio from discovery all the way to sale.

It is a **logged-in SaaS dashboard** (not a marketing site) — a dense,
data-heavy "command center" with a persistent left sidebar.

---

## 2. Design language

- **Style:** Modern dark-first SaaS dashboard. Clean, technical, "fintech /
  developer-tool" energy. Lots of cards, badges, metrics, and tables.
- **Mood:** Confident, premium, data-dense but breathable. Subtle glow accents,
  glassmorphism, rounded corners. Never playful or skeuomorphic.
- **Density:** High information density — small text sizes, compact rows, many
  KPI tiles — but organized into clearly bordered cards with generous internal
  padding.
- **Light & dark mode:** Both fully supported, **dark mode is the hero**. Theme
  toggle persists. Light mode = white/slate-50 surfaces; dark mode = near-black
  slate.

---

## 3. Color palette

### Neutrals (the base — Tailwind "slate")
| Role | Dark mode | Light mode |
|---|---|---|
| App background | `#030712` (slate-950/near-black) | `#ffffff` |
| Card / panel background | `slate-900` at ~40–45% opacity (glassy) | `slate-100` (`#f1f5f9`) |
| Borders | `slate-800 / slate-900` (very subtle) | `slate-200` |
| Primary text | `slate-50 / slate-100` | `slate-900` (`#0f172a`) |
| Secondary / muted text | `slate-400 / slate-500` | `slate-500` |

### Brand & accent
| Purpose | Color |
|---|---|
| **Primary brand / actions / active nav** | **Indigo** `#6366f1` (indigo-500) → hover indigo-400 |
| Secondary brand (gradients, AI features) | **Violet / Purple** `#a855f7` |
| Signature gradient | `linear-gradient(to right, #6366f1, #a855f7)` (indigo→violet) |
| Glow / ambient halo | indigo at 15% opacity, heavy blur |

### Semantic status colors (always shown as soft "tinted pill" — colored text + 10% bg + 25% border)
| State | Color |
|---|---|
| Success / active / verified / sent | **Emerald** `#10b981` |
| Warning / paused / draft / pending | **Amber** `#f59e0b` |
| Danger / bounce / failed / delete | **Rose** `#f43f5e` |
| Neutral / info | Slate |

---

## 4. Typography

- **Font family:** `Geist` (sans) for all UI; `Geist Mono` for code/monospace.
- **Headings:** Heavy weight — page titles use `font-black` (900), ~20–24px.
- **Body:** 14px default; lots of 11–13px for metadata, labels, table cells.
- **Labels / eyebrows:** 11px, UPPERCASE, letter-spaced, muted slate — used
  above metric values and section titles.
- Antialiased, with stylistic ligature features enabled.

---

## 5. Shape, depth & motion

- **Corners:** Rounded everywhere — `rounded-lg` (8px) for cards/buttons,
  `rounded-2xl` (16px) for auth cards/modals, `rounded-full` for pills & badges.
- **Glassmorphism:** Key cards use `.glass-card` — translucent background +
  16px backdrop blur + soft large shadow. Hover lifts with an indigo glow ring.
- **Shadows:** Soft and large (`0 8px 32px rgba(0,0,0,.37)`), never harsh.
- **Ambient glow:** Blurred circular indigo "glow-bg" blobs pulse slowly
  (8s ease-in-out) behind hero areas.
- **Premium buttons:** Gradient border trick (dark fill + indigo→violet border).
- **Transitions:** 0.3s cubic-bezier on hover (color, border, glow).
- **Scrollbars:** Custom thin (6px), rounded, translucent gray.

---

## 6. Layout system

**Two-zone app frame** (the `OutboundShell`), present on every logged-in page:

```
┌────────────┬─────────────────────────────────────────────┐
│            │  HEADER (sticky, blurred)                     │
│  SIDEBAR   │   ┌ eyebrow: "✉ AI outbound email automation"│
│  (fixed,   │   ├ H1 Page Title (font-black)               │
│   288px,   │   ├ subtitle (muted)         [actions][🔔][☀] │
│   72 = w-72)│  ├─────────────────────────────────────────┤
│            │                                               │
│  • logo    │   MAIN CONTENT                                │
│  • nav     │   (px responsive, py-6)                       │
│  • footer  │   grids of cards / tables / KPI tiles         │
│   widgets  │                                               │
└────────────┴─────────────────────────────────────────────┘
```

- **Sidebar (left, 288px, w-72):** Fixed full-height, scrollable. Hidden on
  mobile/tablet (`lg:` breakpoint) and replaced by a horizontal scrolling chip
  bar under the header.
- **Header:** Sticky, semi-transparent with backdrop blur. Holds eyebrow + title
  + subtitle on the left; page actions, a notification bell (with red unread
  badge), and theme toggle on the right.
- **Content:** Responsive horizontal padding (16 → 32px), card-based grids
  (commonly 2–4 columns of metric tiles, then wider content cards below).
- **Max readable width:** subtitles cap at ~`max-w-3xl`.

### Sidebar anatomy (top → bottom)
1. **Brand block:** logo image (36px rounded square, purple globe/pin) + "GeoLead
   AI" (black weight) + tagline "Find. Connect. Close." (11px muted).
2. **Nav list:** 14 items, each a 40px row: icon (16px, lucide) + label. Active
   item = indigo-tinted background + indigo border + light indigo text. Inactive
   = muted slate, hover lightens.
3. **Footer widgets:**
   - Theme toggle button (sun/moon).
   - **"Compliance Guardrails"** card — emerald-tinted, shield icon, reassuring
     copy about opt-outs / sender limits / suppression.
   - **User card** — avatar circle + name + email (links to Profile) + "Sign
     out" button.

---

## 7. Navigation (sidebar order & icons)

| # | Label | Icon | What it is |
|---|---|---|---|
| 1 | **Overview** | layout-dashboard | Outbound command center / home KPIs |
| 2 | **Portfolio** | globe | All owned domains workspace |
| 3 | **Sales Kanban** | kanban | Drag domains across sale pipeline |
| 4 | **Acquisition Advisor** | shopping-cart | AI buy/avoid domain analysis |
| 5 | **Watchlist** | star | Monitor wanted domains for availability |
| 6 | **Lead Explorer** | search | Discover & enrich business leads |
| 7 | **Campaigns** | layout-dashboard | Build & run email sequences |
| 8 | **Quick Send** | mail | One-off email |
| 9 | **AI Generator** | bot | Generate cold emails / follow-ups |
| 10 | **Inbox** | inbox | Unified reply triage |
| 11 | **Analytics** | bar-chart | Opens/clicks/replies/deliverability |
| 12 | **Senders** | send | Sender identities, rotation, SPF/DKIM |
| 13 | **Templates** | layers | Saved email templates |
| 14 | **Settings** | settings | Providers, AI, account config |

Iconography: **Lucide** line icons throughout, 14–16px, stroke style.

---

## 8. Core component library

- **MetricCard / KPI tile:** bordered slate card → 11px uppercase muted label →
  big `font-black` number (24px) → optional helper line. Shown in 2–4 col grids.
- **StatusBadge:** rounded-full pill, 11px bold, semantic tinted (emerald/amber/
  rose/slate) per status keyword.
- **EmptyState:** centered card, bold title + muted body — used wherever data is
  absent ("No campaign data yet", etc.). Friendly, instructive copy.
- **Modal:** centered rounded-2xl panel over a dim backdrop; titled; used for
  add/edit forms (add domain, record sale, AI variants, opens detail…).
- **Cards / panels:** the dominant building block — bordered, padded, often with
  a small icon + title header row.
- **Tables / rows:** compact lead/recipient/reply lists with inline badges,
  small circular icon-buttons (call, email, save, delete) on hover.
- **Forms (auth & settings):** labeled inputs, rounded, slate background, indigo
  focus ring; full-width indigo submit button; red error banner / emerald notice
  banner.
- **Tabs:** pill or underline tabs inside pages (e.g., Watchlist:
  Watched / Available / High priority / Notifications).

---

## 9. Auth screens (separate, centered layout)

Not the dashboard frame — a **centered card** (`AuthShell`) on the plain slate
background:

- Logo + "GeoLead AI" centered at top.
- Rounded-2xl card with soft shadow + backdrop blur.
- Title (e.g., "Welcome back") + muted subtitle.
- Stacked labeled fields → full-width indigo button.
- Footer link line ("Don't have an account? Sign up").
- Pages: **Login**, **Register**, **Forgot password**, **Reset password**,
  **Verify email**.

---

## 10. Page-by-page intent (what each screen shows)

| Page | Headline | Content feel |
|---|---|---|
| **Overview** (`/`) | "Outbound Command Center" | Top KPI row, campaign list, recent-events feed, sender health. Empty states guide first actions. |
| **Portfolio** | "Domain Portfolio" | Grid/list of owned domains with category, status, AI score; add/import/edit/sell/archive; filters. |
| **Sales Kanban** | "Sales Kanban" | Drag-and-drop columns (pipeline stages); status syncs app-wide. |
| **Acquisition Advisor** | "Domain Acquisition Advisor" | Paste a domain list → AI ranked **buy/avoid** cards with reasoning, "Ask AI investor" chat, add-to-watchlist/portfolio, Wayback archive check. |
| **Watchlist** | "Domain Watchlist" | Watched domains with priority dots, DNS "check now", reminders, availability alerts; tabs + notifications. |
| **Lead Explorer** (`/dashboard`) | Lead discovery | Search businesses → enriched lead cards: emails (verified badges), phones (call), **LinkedIn-verified** decision-maker badge, scores, bulk actions. |
| **Campaigns** | "Campaign Manager" | Create campaign, domain-scoped lead picker, schedule, pause/resume; per-campaign **AI Variants** (A–E, spam score) & **Opens** detail modals; sent/open/reply stats + "next follow-up" timer. |
| **Quick Send** | "Quick Send" | Simple one-off email via any active sender. |
| **AI Generator** | "AI Email Generator" | Generate compliant cold emails, follow-ups, A/B subjects, multilingual, deliverability rewrites. |
| **Inbox** | "Unified Inbox" | Gmail replies matched to lead/campaign/domain, AI sentiment/intent, pipelined; mailbox status banner. |
| **Analytics** | "Analytics Center" | Opens/clicks/replies/bounces/unsub, sender health, subject & template performance, AI recommendations. |
| **Senders** | "Sender Accounts" | Sender identities, rotation, warm-up, SPF/DKIM/DMARC status, encrypted provider config. |
| **Templates** | "Templates Library" | Cold opens, follow-ups, variants, localized templates with spam-aware scoring. |
| **Settings** | sectioned | General, Email, AI, Domains, Notifications, Integrations (connected/last-verified/health). |
| **Profile** | "Profile" | Account info, change password, email verification, plan. |
| **Domain detail** (`/portfolio/[id]`) | domain name | CRM workspace per domain: AI report, buyer pool (high/med/low intent bar), offers log, linked campaigns. |

---

## 11. Voice & microcopy

- Confident, helpful, slightly technical. Action-first ("Create a campaign to
  start scheduling respectful outreach.").
- **Compliance & "respectful outreach"** is a recurring theme — the brand leans
  on being trustworthy/deliverability-safe, not spammy.
- Empty states always explain the next step rather than just saying "no data".

---

## 12. Quick "imagine it" summary

> A near-black, indigo-accented SaaS command center. A fixed 288px left sidebar
> with a purple globe logo, 14 line-icon nav items (active one glowing indigo),
> and a reassuring emerald "Compliance Guardrails" card at the bottom. The main
> area opens with a bold black-weight title and muted subtitle under a blurred
> sticky header (notification bell + theme toggle on the right), then flows into
> grids of glassy bordered cards — uppercase mini-labels over big numbers,
> emerald/amber/rose status pills, compact data rows with hover action buttons.
> Everything is rounded, softly shadowed, with subtle indigo→violet gradients and
> slow ambient glow. Clean, dense, premium — Linear/Vercel-dashboard energy
> applied to AI domain investing and cold outreach.
