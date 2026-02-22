# COOL-SITE-INSTRUCTIONS-2026.md
**Purpose:** When I ask Codex to build a “simple website” (DB viewer, mission control, admin tool), it should still look *premium* and *current*—without becoming a marketing site.

## 0) The Aesthetic Target (2026 utility-premium)
Build interfaces that feel:
- **Organized (Bento grid / card system)**: clear compartments, readable density.
- **Material-aware (glass + depth)**: subtle translucency, layered surfaces, soft shadows.
- **Typography-forward**: strong hierarchy, big labels, crisp numbers.
- **Motion-light**: micro-interactions only; no gimmicks.
- **Dark-mode native**: designed, not “inverted.”

Notes:
- Bento/grid layouts are now a default pattern for high-end UIs. :contentReference[oaicite:0]{index=0}
- Modern “glass” is trending toward OS-native materials (visionOS / Liquid Glass influence). :contentReference[oaicite:1]{index=1}
- If using an app-in-chat context, prioritize “native fit” and composable actions. :contentReference[oaicite:2]{index=2}

---

## 1) Layout: make “simple” feel designed
### 1.1 Use a Bento Grid as the default scaffold
- Use a **12-col grid** on desktop; **single column** on mobile.
- Prefer **cards** with rounded corners and consistent padding.
- Mix card sizes intentionally:
  - “Hero card” for primary state/summary
  - “Metrics row” for KPIs
  - “Details table” for raw data
  - “Activity log” for traceability

**Rule:** Everything goes into a card. Even the table.

### 1.2 Density: dashboard UI is about *calm compression*
- Comfortable spacing + high information density:
  - Use clear sectioning and whitespace *between groups*, not between every line.
- Use a **sticky header** with global search + filters + environment selector.

---

## 2) Typography: hierarchy is 70% of “cool” 
### 2.1 Standard hierarchy (minimum viable premium)
- Page title: 28–36px
- Section label: 14–16px, semi-bold
- KPI number: 32–56px (big, confident)
- Body: 14–16px
- Table: 12–14px but with excellent row spacing

### 2.2 Numeric UI (mission control rules)
- Align numbers right in tables.
- Use tabular numerals if available.
- Always show units, and make them visually secondary.

---

## 3) Color & surfaces: “glass + contrast + restraint”
### 3.1 Default palette approach
- Use **neutral base** (light or dark).
- Pick **one accent color** for interactive states (buttons, selected, active).
- Use a second accent *only* for status semantics (success/warn/error).

### 3.2 Glass / depth (use sparingly)
- Use a subtle translucent surface for:
  - top nav / command bar
  - floating inspector panels
  - modal shells
- Keep text contrast high; never sacrifice legibility for effects.
Apple’s “material” approach is a good mental model (dynamic glass-like surfaces). :contentReference[oaicite:3]{index=3}

---

## 4) Components that instantly upgrade “simple tools”
### 4.1 Command bar (mandatory)
- ⌘K opens a command palette for:
  - Jump to table/view
  - Toggle environments
  - Run common queries
  - Create/export actions

### 4.2 Filters that feel like product
- Use “pill” filter chips
- Show active filters as removable tokens
- Provide “Saved Views” 

### 4.3 Tables that don’t look like 2014
- Sticky header
- Zebra rows (subtle)
- Column resize
- Inline sort + filter per column
- Row hover reveals quick actions (copy ID, open detail, export)

### 4.4 Side panel inspector (the “pro” move)
- Clicking a row opens a **right-side inspector**:
  - Summary
  - JSON/raw payload (collapsible)
  - Related entities
  - Actions (retry, re-run, delete, archive)

---

## 5) Motion: micro-interactions only
- Use 120–180ms transitions for hover/focus/expand.
- Animate:
  - card elevation on hover (very subtle)
  - loading skeletons
  - inspector slide-in
- Do NOT animate everything. No parallax in admin tools.

---

## 6) UX principles for internal tools (non-negotiable)
- **Speed:** “fast by default” (lazy load heavy panels, virtualize big tables).
- **Traceability:** show timestamps, actor, and provenance for changes.
- **Safety:** destructive actions require confirmation + show affected count.
- **Accessibility:** keyboard navigation, focus states, color-contrast compliance.

If the UI lives inside a conversational system, preserve “native fit” and composable actions. :contentReference[oaicite:4]{index=4}

---

## 7) Implementation defaults (for Codex)
Pick one stack and stick to it:
- **Next.js + Tailwind + shadcn/ui** (fastest path to “premium utility”)
  - Shadcn dashboard example reference: :contentReference[oaicite:5]{index=5}
  - Vercel shadcn admin template reference: :contentReference[oaicite:6]{index=6}

**Rule:** Use design tokens (CSS variables) for color, radius, shadow, spacing.

---

## 8) “Codex Prompt Addendum” (paste into every request)
> Build the UI with a 2026 premium utility aesthetic:
> - Default to a bento-grid dashboard layout (cards, clear hierarchy).
> - Dark mode supported and designed (not inverted).
> - Strong typography hierarchy (big KPIs, crisp labels, readable tables).
> - Add a command palette (⌘K) and a right-side inspector panel for row details.
> - Tables: sticky header, inline sort/filter, row hover actions, pagination/virtualization.
> - Use subtle glass-like surfaces for nav/overlays (legibility first).
> - Use consistent design tokens (CSS variables) and reusable components.
> - Keep motion minimal (micro-interactions only).
> - Prioritize speed, traceability, accessibility, and safe destructive actions.

---

## 9) Inspiration sources (for self-calibration)
Use these to “calibrate taste” before building:
- Bento grid inspiration: Awwwards elements :contentReference[oaicite:7]{index=7}
- High-quality dashboard patterns: Mobbin (web dashboards) :contentReference[oaicite:8]{index=8}
- Broad modern site curation: Godly :contentReference[oaicite:9]{index=9}

---

## 10) Definition of Done (visual)
A build is “cool enough” if:
- It looks intentional in 5 seconds (grid, hierarchy, spacing).
- You can operate it entirely by keyboard.
- The table + inspector pattern makes data feel navigable.
- Dark mode looks native and readable.
- It loads fast and never feels fragile.
