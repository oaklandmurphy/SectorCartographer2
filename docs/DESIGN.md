# Sector Cartographer: Design Document

Status: **Draft 0.1** (first pass, written from a read of the code, not from a live walkthrough)
Scope: visual and interaction design of the web app. Data model, Firebase and routing are out of scope except where they constrain design.

How to use this doc: sections 1 to 5 describe what exists today. Sections 6 to 9 are proposals. Every proposal has an ID (`D-01`, `D-02`, ...) so we can accept, reject or reorder them by ID in review. Anything marked **(confirm)** is my inference and needs your call. Section 10 is the decision log; move items there as we settle them.

---

## 1. Purpose and audience

A shared, live sector map and campaign wiki for a tabletop or play-by-post sci-fi game. One GM, several players, each seeing only what their character knows.

| Viewer | What they need from the UI |
|---|---|
| GM | Fast editing, bulk oversight, resolving player actions. Dense is acceptable. |
| Player | Know their faction's situation at a glance, plot moves, read lore. Often on a phone, between turns. |
| Anonymous visitor | Read-only look at the public map and codex. |

Design goal **(confirm)**: the site should feel like an in-fiction tool, a battered command-center terminal the factions themselves might use, not a generic dark-mode dashboard. Reading the lore should feel like reading dossiers pulled from an archive.

## 2. Setting brief

Inferred from the code, constants and README. **(confirm all of this)**

- **Name in the UI:** "The Fate of the Zotov Sector" (`Toolbar.jsx`). The app itself is "Sector Cartographer".
- **Register:** military space opera. Admiralty, carriers and squadrons, hyperlanes, jump gates, a "DRADIS-style scope overlay" (the code comment names the Battlestar Galactica reference directly).
- **Powers (default sector):** Gorbulon (old feudal power), the Empire, Flubbadite (rising industrial miners), Children of Luuk (refugee faith), the 11th Fleet (admiralty), Houses of Dorn (drug trade), Bord (shipbuilders) and Vega (merchants), the Shipwright Guild, the Prophet.
- **Materials and tech:** Ossite deposits, jump gates, carrier hangars, squadrons, agents and operatives.
- **Tone:** worn, industrial, politically tangled. Closer to "used future" than to neon.

Visual touchstones to test against: CIC plotting tables, naval survey charts, stenciled hardware labels, dot-matrix and CRT readouts, redacted intelligence files. **(confirm or replace)**

## 3. Information architecture

Ten top-level views, one hash route each (`navTabs` in `App.jsx`). Some are role-gated.

| Tab | Who | Purpose | Main component |
|---|---|---|---|
| Map | all | Systems, hyperlanes, fleets, agents, orders, freehand drawing | `MapCanvas`, `Toolbar`, `SidePanel` |
| Fleets | all | Carriers, hangars, squadrons, compare mode, ship art library | `FleetView`, `ArtLibrary` |
| Agents | players, GM | Operatives per faction | `AgentsView` |
| Assets | all | Resources, trackers, modifiers, projects, surface forces | `AssetsView` |
| Politics | all | Faction graph, relationship edges, member rosters | `PoliticsView` |
| Codex | all | Wiki: news, factions, characters, locations, lore, rules, misc | `WikiView`, `CodexBody` |
| Timeline | all | Codex articles laid out by turn | `TimelineView` |
| Updates | all | Unseen articles and resolutions, with count badge | `UpdatesView` |
| Archive | players, GM | Past submitted actions and orders | `ActionArchiveView` |
| GM Tools | GM | Request queue, roll resolution, end-of-turn checks | `GMToolsView` |

Chrome stack on desktop, top to bottom: global tab bar, then (on Map) the map toolbar, then (for players) the resource and tracker rail, then the view. That is up to three horizontal bands before any content.

## 4. Current visual system

### 4.1 Tokens (`src/theme.js`)

| Token | Value | Role today |
|---|---|---|
| `void` | `#0c0a06` | Page and scene background |
| `panel`, `panel2`, `panel3` | `#181510`, `#211c15`, `#2a2318` | Three raised surface levels |
| `line` | `#4a4030` | All borders and rules |
| `text`, `mut`, `faint` | `#d8d0b8`, `#a89c82`, `#6b6250` | Primary, secondary, tertiary text |
| `accent` | `#9fc23a` | Acid olive-lime: primary action, active state, "saved", links, table headers, brand mark |
| `amber` | `#d98f2b` | Pending counts, queue mode, warnings |
| `danger` / `dangerText` | `#b23a2e` / `#e5988c` | Destructive |
| `ink` | `#14110b` | Near-black for borders and glyphs on swatches |

Faction colors are GM-chosen at runtime. Relationship edges, tracker severities and role chips each have their own hard-coded palettes in `constants.js` and `App.jsx`.

### 4.2 Type

| Stack | Used for |
|---|---|
| Big Shoulders Stencil (700/900) | Panel and popup titles, brand, table captions, "ACCESSING ARCHIVE" |
| Oswald (400 to 700) | Default UI face: buttons (uppercase), labels, tabs |
| IBM Plex Mono | System names on the map, numbers, **and the full body text of Codex entries** |

Font sizes in inline styles: 15 distinct values from 8.5px to 18px. The most common are 10.5, 11.5, 11, 10, 12.5, 12 and 9.5. Body content is therefore almost always below 13px.

### 4.3 Shape and chrome

- **Chamfer:** `cut(px)` clips two opposite corners via `clip-path`. Used on panels, popups, plates, buttons' parent groups.
- **Rivets:** `Rivet.jsx`, 5px dots, two per popup (top right, bottom left). Only `PanelPopup` uses them.
- **Buttons:** `Btn.jsx`. Uppercase Oswald, 1px border, inset highlight and shadow. Three kinds: ghost, primary (lime tint), danger. Active state fills solid lime with a glow.
- **Target brackets** (`TargetBrackets.jsx`) for selection, **system glow** (`SystemGlow.jsx`) for relevance to a selected agent or fleet.
- **Scene backdrop** (`sceneBackdrop`): survey grid at 64px over a vignette, plus a repeating 640x360 starfield tile, plus (Map only) range rings and a rotating radar sweep and a scanline overlay.

### 4.4 Components that carry the setting best today

These are the existing wins. New work should match their level of commitment.

1. **Faction heraldry** (`factionSymbols.jsx`): hand-drawn, per-faction glyphs on a shared 24px grid (coronet, hex-nut and ore shard, eternal flame, orb and cross, crying eye...). Each is tied to its Codex entry. This is the most setting-specific asset in the app.
2. **System plate and fleet wedge** (`MapPieces.jsx`): chamfered, faction-colored, with a baked bevel. Reads as a physical token on a plotting table.
3. **Radar overlay and scanlines** on the map.
4. **Copy voice in a few places:** "ACCESSING ARCHIVE / RETRIEVING SECTOR RECORD", "NO ENTRY SELECTED", "Phantom system (GM decoy)".
5. **Stencil headings** with wide tracking.

## 5. Inventory of reusable components

| Component | File | Notes |
|---|---|---|
| `Btn` | `ui/Btn.jsx` | Only button primitive. Every control, tab and toggle is one. |
| `PanelPopup`, `PopupHeader`, `MapPopup` | `ui/` | Shared popup chrome. Good seam for global change. |
| `MobileTabRail` | `ui/MobileTabRail.jsx` | Collapses side rails to a dropdown on phones. |
| `Rivet`, `TargetBrackets`, `SystemGlow`, `Starfield` | `ui/` | Pure decoration. |
| `ShipArt` | `ui/ShipArt.jsx` | Renders library SVGs with an optional faction tint. |
| `MapPieces` (`SystemPlate`, `SubregionRing`, `FleetGlyph`, `AgentGlyph`) | `ui/MapPieces.jsx` | Shared by live map and `BoardSnapshotModal`. |
| `CodexBody` | `CodexBody.jsx` | Prose and CSV tables. |
| `VisibilityRow`, `AccessControl` | | Per-role visibility and login. |

Structural fact that shapes everything below: there are roughly **1,500 inline `style={{...}}` objects**, one stylesheet of 36 lines, no CSS variables, and exactly one `:hover` rule in the codebase (the map piece scale-up). Tokens live in JS only. Anything that needs `:hover`, `:focus-visible`, `::before`, media queries or theming is currently awkward or impossible.

---

## 6. Findings: where it can be cleaner

Severity: **H** hurts usability now, **M** noticeable polish gap, **L** nice to have.

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| D-01 | H | **Secondary text is too dim at small sizes.** The shared `lbl` style (form labels, section captions) is 10px, tracked, in `faint` on `panel`. Measured contrast is about 3.0:1 (`faint` on `panel`) and 2.8:1 on `panel2`. Small text needs 4.5:1. `danger` text (`#b23a2e`) is also about 3:1. | `theme.js` `lbl`; contrast computed from the token hex values |
| D-02 | H | **Type scale is not a scale.** 15 sizes, half-pixel steps, most between 9.5 and 12.5px. Neighbouring sizes (10, 10.5, 11, 11.5) are indistinguishable in practice and make hierarchy come from case and tracking instead. | Grep of `fontSize` across `src/` |
| D-03 | H | **Accent does too many jobs.** Lime means: brand, primary button, selected tab, selected row, "saved", link, table header, toggle on, slider thumb, and focus border. When everything is the highlight, nothing is. It also reads as modern terminal-green, which fights the warm brown palette and the military setting. | `Btn.jsx`, `Toolbar.jsx` `SaveStatus`, `CodexBody.jsx`, `index.css` |
| D-04 | H | **Codex prose is monospace, 13.5px, `pre-wrap`.** The lore wiki is the richest setting content and has the least typographic presence. Long reading in mono is tiring, and entries all look like log output regardless of whether they are news, a character file or a rule. | `CodexBody.jsx` |
| D-05 | M | **Chrome density on Map.** Tab bar, then a toolbar with roughly 15 controls (brand, 4 mode buttons, lock, add system, add fleet, draw palette, undo, clear, zoom out, readout, zoom in, reset, panel toggle) that wraps on narrow desktops, then the asset rail. Editing and navigation controls share one visual weight. | `Toolbar.jsx`, `App.jsx` |
| D-06 | M | **Flat button hierarchy.** Every control is the same uppercase 11.5px Oswald button. Tabs, tools, toggles, destructive actions and zoom steppers are distinguished only by tint. Navigation tabs are literally `Btn active`. | `Btn.jsx`, tab bar in `App.jsx` |
| D-07 | M | **Chamfer clips its own border and shadow.** `clip-path` cuts off `box-shadow` entirely (so the `0 10px 30px` in `panelStyle` never shows) and the 1px border is not drawn along the cut diagonals, so corners look like a bite taken out rather than a bevelled plate. | `theme.js` `cut`, `panelStyle`, `floatingPanel` |
| D-08 | M | **Two icon languages.** Thin-stroke Lucide icons at 13 to 14px sit beside heavy stencil type and solid, hand-drawn faction glyphs. Status-marker and agent icons are generic office metaphors (Gem, Fuel, Camera, Megaphone) rather than setting-specific marks. | `constants.js` `ICONS`, `AGENT_ICONS` |
| D-09 | M | **Brand and shell are generic.** A Lucide star in a green chamfer, title text only on desktop, "SECTOR" on mobile. `index.html` has a title and nothing else: no favicon, no `theme-color`, no description, no social card. Link previews in Discord (which the app targets via `DISCORD_GAME_ROLE`) show a bare title. | `Toolbar.jsx`, `MobileToolbar.jsx`, `index.html` |
| D-10 | M | **Map background is a screen-space texture, not a place.** Grid, starfield tile and radar rings appear anchored to the viewport rather than the map, and the 640x360 tile repeats visibly. There is no sense of territory: no faction regions, no nebulae, no dead zones, no scale bar or coordinates. Hyperlanes are one uniform dashed brown line. **(verify screen-anchoring in the running app)** | `theme.js` `sceneBackdrop`, `Starfield.jsx`, `MapPieces.jsx` `LINK_LINE_PROPS` |
| D-11 | M | **Map has no information hierarchy between systems.** Capitals, jump-gate hubs, Ossite worlds and empty rocks use the same plate. Jump gates and Ossite are flags in the popup, not visible on the map unless added as a marker. | `SystemPlate`, `SystemPopup.jsx` |
| D-12 | M | **Faction color can break glyph legibility.** Heraldry is drawn in `ink` over whatever color the GM picks. A dark or saturated-blue faction yields a near-invisible symbol. | `MapPieces.jsx`, `FactionSymbol` calls with `T.ink` |
| D-13 | M | **Voice is inconsistent.** Loading and empty states speak in-fiction. Buttons, tooltips and dialogs speak plain software ("Add a star system (or double-click the map)", "Clear all drawing on the map? This cannot be undone."). | `App.jsx`, `Toolbar.jsx`, `useConfirm.jsx` |
| D-14 | L | **Politics view reuses the map's backdrop.** Same grid, stars and scanlines, so switching tabs does not change the sense of place. A diplomatic chart could look like a different instrument. | `PoliticsView.jsx` |
| D-15 | L | **Decoration is under-used.** Rivets appear only on popups. No hazard striping, stencil serials, corner registration marks, panel screws on main views, or stamped labels. | `Rivet.jsx` usage |
| D-16 | L | **Motion is all-or-nothing.** The reduced-motion rule kills every animation and transition, including the loading spinner. There is almost no purposeful motion otherwise (popup fade, pulses). | `index.css` |
| D-17 | L | **Accessibility basics.** Viewport meta sets `maximum-scale=1, user-scalable=no`, blocking pinch-zoom for low-vision users. No visible `:focus-visible` ring on buttons (only inputs get the lime border). Many icon-only buttons rely on `title`. | `index.html`, `index.css` |
| D-18 | L | **Hidden information has no visual form.** Per-player visibility is a headline feature, but a player simply does not see things. There is no in-fiction way to show "you know something exists but not what". | `VisibilityRow.jsx`, `visibility.js` |

---

## 7. Proposals: more evocative of the setting

Each proposal lists the findings it addresses, the files it touches, and a rough size (S under half a day, M a day or two, L longer).

### D-20 Tokenize and rebalance the palette (D-01, D-03) · M
- Move tokens to CSS custom properties on `:root`, keep `theme.js` exporting `var(--...)` strings so inline styles keep working. This unlocks `:hover` and `:focus-visible` through a real stylesheet and is the enabling step for most other items.
- Raise `faint` to reach 4.5:1 on `panel` (roughly `#8f836a`) and add a separate `ghost` token for decorative, non-text strokes at the current dim value.
- Split the accent by job. Suggested roles, to be tuned by eye:
  - **Phosphor** (current lime, slightly warmer): live and system state only (saved, online, radar, selection brackets).
  - **Brass/amber**: primary actions and active tab.
  - **Bone**: links and table headers.
  - **Signal red**: destructive and war only.
- Open question: does the table want the CRT-green identity kept as the signature, or shifted toward amber phosphor? See Q-02.

### D-21 Real type scale and a reading face for the Codex (D-02, D-04) · M
- Adopt a six-step scale and nothing else: 11, 12, 13, 15, 18, 24. Round every inline size to the nearest step. Floor of 11px for any text a player must read.
- Keep Big Shoulders Stencil for titles. Use Oswald only for UI chrome. Move long-form Codex prose to a readable face at 15 to 16px with 1.6 line height. Candidates: a slab or typewriter-leaning serif (Courier Prime, Special Elite for headers only, or IBM Plex Serif to stay in family). Keep Plex Mono for numbers, coordinates and stat tables.
- Per-category dossier treatment in `WikiView`:
  - *Characters:* file header with portrait frame, "SUBJECT", faction stamp.
  - *Factions:* heraldry large in the header, relation summary strip.
  - *News:* masthead, dateline with turn number.
  - *Rules:* numbered, plain, no flourish.
  - *Lore:* archive reference code in the corner.

### D-22 A proper header and brand (D-09) · S
- Replace the Lucide star with a bespoke mark. Candidate: a survey-chart compass rose or a stylised range-ring-and-sweep, in the stencil weight.
- Add favicon, `theme-color`, meta description and an Open Graph card (title, one-line description, a rendered map crop). Needs a `public/` folder, which does not exist yet.
- Make the campaign title configurable (it is hard-coded as "The Fate of the Zotov Sector"). **(confirm: is this a one-campaign site?)**

### D-23 Rework map chrome into zones (D-05, D-06) · M
- Split the toolbar into three groups with visible dividers and different weights:
  1. **Tools** (select, link, draw, orders) as a segmented control, left.
  2. **Create** (system, fleet) behind a single "Place" menu, since they are infrequent.
  3. **View** (zoom, reset, panel) as a compact cluster pinned bottom-right over the map like a physical bezel, freeing the top bar.
- Make navigation tabs their own component, not `Btn active`: flat, underline or notch-style, with a distinct active shape.
- Give `Btn` a size prop and a quiet "icon" variant for steppers.

### D-24 Fix the chamfer (D-07) · S
- Replace `clip-path` with a layered technique so the border follows the cut: an outer wrapper filled with `line` colour clipped to the chamfer, with an inner element inset by 1px and clipped the same way. Put shadow on a non-clipped parent with `filter: drop-shadow`.
- Wrap it once as `<Plate>` and migrate `PanelPopup`, `floatingPanel`, `SystemPlate` and `Btn` containers.

### D-25 Make the map a place (D-10, D-11) · L
- Anchor grid and stars to world space with a slow parallax (stars at 0.3x pan speed). Use two or three tile layers at different densities so the repeat is not visible.
- Add optional GM-paintable **region overlays**: soft faction-colored territory blobs, nebula and hazard zones, with labels set along an arc in stencil caps. This is the single biggest step from "graph" to "chart".
- Tier the system plate by role: capital (double ring), jump-gate hub (gate glyph ring), Ossite (small ore facet), ordinary. Surface these from the existing `hasJumpGate`, `hasOssite` flags with no new data.
- Vary hyperlane styling by type: solid for gated lanes, dashed for unmapped or dangerous, with a faint glow along lanes adjacent to a selected piece. Add a scale bar and edge ticks with sector coordinates, as on a survey sheet.
- Add a map legend that is part of the fiction (a cartouche in a lower corner).

### D-26 A setting-specific icon set (D-08) · M
- Redraw the 15 status-marker icons and the 18 agent icons on the same 24px grid, same stroke weight and corner treatment as the faction heraldry. Solid or two-tone rather than thin outline. Keep Lucide for utility icons (close, chevron, zoom).
- Start with the markers players see most: Ossite, jump gate, blockade, radiation, hostile presence.

### D-27 Heraldry contrast (D-12) · S
- Pick glyph colour by faction-colour luminance: `ink` on light, a pale bone on dark. One helper, used in `SystemPlate`, `FleetGlyph`, `AgentGlyph`, popup headers and the side panel swatches.

### D-28 In-fiction voice pass (D-13, D-16) · S
- Write a short voice guide (section 8). Apply to: confirm dialogs, empty states, error and save states, tooltips, the access popover, loading text per view.
- Examples, for tone only: "Clear all drawing?" becomes "Wipe the plotting overlay? This cannot be recovered." Save status: "SAVED" becomes "RECORD SYNCED". View-only badge: "CLEARANCE: OBSERVER".
- Keep functional clarity first. Anything that changes data must still say plainly what it does.

### D-29 Redaction as a visual language (D-18) · M
- Render information a viewer is not cleared for as **redacted bars** with the entry's existing metadata visible (title, category), rather than hiding it. Applies to codex entries a player can see exist but not read, and to unrevealed fields in popups.
- GM sees a toggle to preview "as player X". Each role colour becomes a clearance stripe in the header.
- Check against the visibility rules in `lib/visibility.js` before committing: some entries are meant to be wholly invisible, not redacted. See Q-05.

### D-30 Differentiate the Politics scene (D-14) · S
- Different instrument: a radial or slightly paper-toned diplomatic chart, thicker pinned-string edges, relation icon badges at edge midpoints, seals instead of dots. Keep the same tokens and plate chrome so it still belongs.

### D-31 Surface decoration and texture (D-15) · S
- Add `<Rivet>` and corner registration marks to the main view frames, a hazard-stripe divider for GM Tools and danger zones, stencilled serial strings (sector id, turn number) in empty corners, and a subtle paper or metal grain on `panel` surfaces.
- Rule of thumb: decoration lives on the edges and never competes with data.

### D-32 Accessibility and motion pass (D-16, D-17) · S
- Drop `maximum-scale` and `user-scalable=no`. Add `:focus-visible` outline in the new brass token. Replace the global animation kill with `prefers-reduced-motion` handling that keeps the loading indicator and removes only pulses and sweeps.
- Add `aria-label` to icon-only buttons.

---

## 8. Voice and tone (draft)

| Principle | In practice |
|---|---|
| Terse, institutional | Short caps labels, no exclamation marks, no emoji. |
| Diegetic where safe | Status, loading, empty and clearance states speak in-world. |
| Plain where it matters | Destructive confirms and errors say exactly what will happen. |
| Consistent nouns | "Sector", "Codex", "Archive", "Fleet", "Operative" or "Agent" (pick one, see Q-04). |

## 9. Suggested sequence

1. **Foundations first (enables everything else):** D-20 tokens to CSS variables, D-21 type scale, D-24 `<Plate>`.
2. **Quick wins:** D-22 shell and favicon, D-27 glyph contrast, D-32 accessibility, D-28 copy pass.
3. **Structural:** D-23 map chrome, D-21 Codex dossier treatment.
4. **Showpieces:** D-25 map as a place, D-26 icon set, D-29 redaction, D-30 politics, D-31 texture.

Risk to flag: because styling is inline and spread over 1,500 sites, D-20 and D-21 touch nearly every file. Do them as mechanical, reviewable passes (token swap, then size swap), not mixed with visual redesign.

## 10. Open questions and decisions

| # | Question | Options | Status |
|---|---|---|---|
| Q-01 | Is this one campaign, or a reusable tool others deploy? Decides whether the title and theme are configurable. | Single campaign / per-sector config | Open |
| Q-02 | Signature colour: keep lime phosphor, or shift to amber phosphor with olive as secondary? | Keep / shift / per-sector theme | Open |
| Q-03 | Reading face for the Codex. | Typewriter-leaning serif / IBM Plex Serif / keep mono at larger size | Open |
| Q-04 | "Agent" or "Operative"? The code and UI say Agent. | Agent / Operative | Open |
| Q-05 | Should hidden codex entries be redacted-visible or fully invisible to players? | Per-entry flag / always invisible / always redacted | Open |
| Q-06 | Do we accept adding a `public/` folder and a couple of image assets (favicon, OG card)? | Yes / no | Open |
| Q-07 | Appetite for a build-time or CSS-module migration away from inline styles, versus staying inline with CSS variables? | Stay inline + vars / CSS modules / Tailwind | Open |
| Q-08 | Which touchstones are right? Battlestar-style CIC is implied by a code comment; are there others (Expanse, Alien terminals, WW2 plotting rooms)? | Free text | Open |

### Decision log

_Nothing decided yet._

### Change log

| Date | Change |
|---|---|
| 2026-10-05 | Draft 0.1 created from a code read. |
