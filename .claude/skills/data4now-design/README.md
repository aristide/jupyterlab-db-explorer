# Data4Now Design System

A foundation for designing **production interfaces, decks, and prototypes** in the Data4Now visual language.

---

## Who is Data4Now?

**Data4Now** is a data-architecture and statistics-modernization consultancy. Their work helps **National Statistical Offices (NSOs) and government data agencies** move off ad-hoc spreadsheet workflows onto modern, on-premises data lakes — Apache NiFi, MinIO, Trino, Apache Airflow, JupyterHub, all stitched together with Active Directory and Kubernetes.

The deck we received (`uploads/D4N-STATIN-Datalake-Architecture.pptx`) is a worked example: a proposed datalake architecture for **STATIN — the Statistical Institute of Jamaica** — covering ingestion, medallion-storage zones (Raw → Anonymized → Staging → Aggregated → Archive), federation, orchestration, and how the lake plugs into existing Nutanix/Veeam/SQL Server infrastructure without rip-and-replace.

The brand sits at the intersection of **public-sector trust** and **modern data tooling**. It needs to read as serious enough for a UN/World Bank partner room and clear enough for a working ministry IT team.

### Partners visible in the source deck
- **Statistical Institute of Jamaica (STATIN)** — client in this engagement
- **United Nations DESA Statistics**
- **The World Bank**
- **Global Partnership for Sustainable Development Data**
- **Sustainable Development Solutions Network**

These are referenced as ecosystem partners — useful context for understanding tone and audience, not part of the Data4Now brand itself.

### Surfaces this system covers
1. **Slide decks** — client-facing technical proposals (the primary output we have evidence of).
2. **Web/marketing surface** — implied by the standalone logo, but not provided. UI kit included is a *plausible* recreation flagged below.
3. **Internal tooling** — could be built on these tokens; no direct evidence in source.

> ⚠️ **Source-fidelity caveat.** The only authoritative material we received is the logo PNG and one PPTX deck. The marketing-site UI kit in `ui_kits/website/` is therefore an **inferred reconstruction** built from the visual DNA of those two assets — not a recreation of an existing site. Please flag corrections.

---

## Sources

| Path | What it is |
|---|---|
| `uploads/datafornow_logos-original.png` | Original full-color logo (transparent PNG, 960×675) |
| `uploads/D4N-STATIN-Datalake-Architecture.pptx` | 20-slide technical proposal — primary source for tone, layout, and color usage |
| `assets/pptx-media/` | Images extracted from the PPTX (cover art, partner logos, diagrams) |
| `assets/data4now-logo.png` | Working copy of the logo |

No Figma file, no codebase, no website URL was provided. If you have any of those, please attach them via the Import menu so we can raise this from "informed inference" to "verified recreation."

---

## CONTENT FUNDAMENTALS — how Data4Now writes

Tone is observed from the STATIN deck: confident technical consulting, not marketing fluff. Voice is **plain-spoken expert**, not breathless or buzzword-heavy.

### Voice characteristics

- **Plain English, not jargon-laden.** When jargon must appear (NiFi, Trino, ODBC), it is named once and immediately translated. Example from the deck: *"Trino federates queries to SQL Server and MariaDB via ODBC/JDBC."* The reader is treated as competent but not assumed to know every product name.
- **Direct, declarative sentences.** Short. Verb-first when possible. Example: *"No data is copied. Trino pushes filters down to each source and merges results in memory."*
- **Problem → solution framing.** Almost every slide pairs a "Today" pain point with a "Tomorrow" answer. Example: *"Today: admin manually checks SFTP, downloads, renames, moves to folder"* → followed by a numbered NiFi pipeline that automates it. Replicate this structure in marketing copy and case studies.
- **Comparative language.** "Replaces:" callouts are used heavily. Each component card answers *what does this remove from your life?*
- **No hype words.** No "revolutionary," "AI-powered," "next-gen," "seamless." If you find yourself reaching for one, name the concrete capability instead.
- **Plural "we" / second-person "you."** The deck speaks *to* the client: *"the data lake complements your current infrastructure"*, *"connecting to your existing systems"*. Use "you" for clients, "we" for Data4Now, "they" for downstream stakeholders.

### Casing rules

- **Sentence case** for almost all UI labels, body, and slide bullet text.
- **Title Case** only for slide titles and section headers (e.g. "Current Challenges & Opportunities", "Data Organization: Medallion Architecture").
- **UPPERCASE** sparingly — for eyebrow labels above slide titles, status pills, and table headers. Wide letter-spacing required when uppercase.
- **PRODUCT NAMES** are written exactly as the vendor writes them: `MinIO` (not Minio), `JupyterHub`, `JupyterLab`, `Apache NiFi`, `Apache Airflow`, `Trino`, `Veeam`, `Nutanix`, `MariaDB`, `Kubernetes`, `SQL Server`, `Active Directory`.
- **ACRONYMS** stay all-caps and unspaced: `STATIN`, `NSO`, `CPI`, `SFTP`, `JDBC`, `ODBC`, `RBAC`, `DAG`, `MDA`, `SDMX`, `RAW/ANONYMIZED/STAGING/AGGREGATED/ARCHIVE` (the medallion zones are styled all-caps in the deck).

### Punctuation & symbols

- **Em dashes** with spaces (`word — word`) for parenthetical asides. Used heavily.
- **Arrow glyphs** to show pipeline flow: `→` between data zones, `▶` to step through DAGs, `▼` between vertical stages. These are an *intentional motif* — keep them.
- **Bullet markers** in source decks use `·` or plain bullets. Avoid emoji bullets.
- **Ampersand** is fine in headings (`Versioning & Volume Backup`); avoid in body.
- **Colons** introduce examples and lists. Used naturally.

### Vocabulary anchors (terms to keep using)

**Pipeline** · **Federate** · **Ingest** · **Provenance** · **Medallion** (Raw/Anonymized/Staging/Aggregated/Archive) · **Orchestration** · **DAG** · **Bucket** · **Schema** · **Single source of truth** · **No rip-and-replace** · **Audit trail** · **Backfill** · **Notebook** · **Statistician** · **Ministry** · **Agency**

### What to avoid

- **No emoji** in the brand voice. The PPTX has none. Don't introduce any.
- **No exclamation points.**
- **No "magic" / "delightful" / "beautifully" / "gorgeously"** language. Data4Now is selling *trustworthy infrastructure*, not delight.
- **No "leverage", "synergy", "stakeholder alignment"** McKinsey-speak. The voice is engineer-meets-statistician, not management consultant.
- **No first-person singular ("I").** Always plural or institutional.

### Worked sample — the same idea in three contexts

| Surface | Example |
|---|---|
| Slide bullet | *"Trino federates SQL Server + MariaDB + MinIO — one query, no exports."* |
| Marketing hero | *"Query every database you already have. From one place. With the SQL you already write."* |
| Case-study quote | *"We replaced six weeks of CSV-juggling with a single SELECT statement."* |

---

## VISUAL FOUNDATIONS

### Color philosophy

The brand runs on **three colors plus a cool-neutral spine**:

- **Navy `#0F3D6E`** is the workhorse — letterforms, headlines, primary buttons, dense text. The deck uses it as the dominant ink color.
- **Teal `#1FA0A0`** is structural support — section dividers, secondary CTAs, the "FOR" pillar in the wordmark. It carries the *flow / pipeline* metaphor.
- **Magenta `#E63558`** is the **single point of emphasis** — used the way the pie wedge is used in the logo: small, intentional, never decorative. Reserve for the one thing on a slide / page that matters most.

Never blend all three in equal weight. A typical slide is ~70% navy/neutral, ~20% teal supporting, ~10% magenta accent (often only one element).

The cool neutral spine (`--d4n-paper` → `--d4n-fog` → `--d4n-mist` → `--d4n-slate` → `--d4n-graphite` → `--d4n-ink`) is biased slightly toward navy, not pure gray. This keeps surfaces feeling related to the brand even with no chromatic color in view.

**Status colors** (`success`, `warning`, `danger`, `info`) are tuned to coexist with brand: danger reuses the magenta (so it doesn't introduce a fourth accent hue), info reuses teal. Success and warning are introduced fresh but desaturated so they don't shout.

**Pipeline colors** (raw / anonymized / staging / aggregated / archive) are a domain-specific scale — bronze/silver/gold conventions from the medallion architecture pattern, but desaturated to fit the brand's cool tone.

### Typography

- **Display / headings:** Montserrat — geometric, slightly condensed feel, the same family used for the wordmark itself. Weights 600/700.
- **Body:** Roboto — neutral, highly legible at small sizes, familiar to readers of government and academic material. Weights 400/500.
- **Mono:** JetBrains Mono — for code samples, file paths, SQL.

Display is set **tight** (line-height 1.12–1.28, letter-spacing slightly negative) for confident headlines. Body is set **relaxed** (line-height 1.5–1.65) for readability of dense technical content. Eyebrow labels use **wide tracking + uppercase** — a strong recognizable signature.

### Backgrounds

- **No gradients** as a default. The PPTX is almost entirely flat color.
- **No hand-drawn illustrations.**
- **No repeating patterns / textures** — keep surfaces clean.
- **Duotone photography** is permitted as a hero device. The cover slide demonstrates it: a real photograph (industrial / civic / landscape) split or overlaid in two of the brand colors (teal + magenta). Use sparingly — title slide, section openers, occasional case-study hero.
- **Full-bleed flat-color sections** in navy or paper-cream are the standard background pattern. Alternate them for vertical rhythm.

### Animation

- **Fades + small translates only.** 200–320ms with `cubic-bezier(0.2, 0, 0.1, 1)`.
- **No bouncy / spring** animations. The brand is technical, not playful.
- **No parallax** on scroll.
- Pipeline diagrams may animate with a *flow* — arrows or zone-fills sequencing left-to-right — but only on user demand (hover / click), not autoplay.

### Hover & press states

- **Buttons & primary CTAs:** hover darkens the fill ~10% (use `--d4n-navy-deep`, `--d4n-teal-deep`, `--d4n-magenta-deep`); pressed darkens further and translates 1px on Y.
- **Links:** hover shifts color from `--fg-link` (teal-deep) to `--d4n-magenta`. This is one of the few places magenta appears as a non-emphasis element.
- **Cards & rows:** hover lifts shadow from `sm` to `md` and slightly raises (`translateY(-2px)`); no border color change.
- **Icon buttons:** hover background `--d4n-fog`; pressed background `--d4n-mist`.
- **Disabled:** opacity 0.5, cursor `not-allowed`, no hover effect.

### Borders & dividers

- **Standard hairline:** 1px solid `--border-1` (`--d4n-fog`).
- **Stronger card border:** 1px solid `--border-2` (`--d4n-mist`).
- **Sectional dividers:** 2px solid `--d4n-teal` for visual emphasis.
- **Focus rings:** 3px `rgba(31,160,160,0.30)` (teal at 30% alpha) — never blue browser default.

### Shadow system

Cool-tinted, shifted toward navy not pure black:

- `--shadow-xs` — input fields at rest
- `--shadow-sm` — cards at rest
- `--shadow-md` — cards on hover, dropdowns
- `--shadow-lg` — modals, popovers
- `--shadow-xl` — full-screen overlays, key callouts
- `--shadow-focus` — teal focus halo

No inner shadows by default. Avoid the dribbble "neumorphic" double-shadow look.

### Cards & containers

The default card pattern:
```
background: white
border: 1px solid var(--d4n-mist)
border-radius: var(--r-lg)   /* 10px */
shadow: var(--shadow-sm)
padding: var(--sp-6)         /* 24px */
```

For **emphasis cards** (hero stats, key takeaways), elevate to navy fill with white text and *no border*. For **subtle cards** (in dense lists), drop shadow and use only `border: 1px solid var(--border-1)` plus `var(--bg-page)` background.

### Capsules / pills

Status pills, tags, and labels use `border-radius: var(--r-pill)`, with a colored background at ~10% alpha and text at full saturation. e.g. `background: var(--status-info-bg); color: var(--status-info)`.

### Corner radii

- `4px` — input fields, small buttons, code chips
- `6px` — buttons, default UI
- `10px` — cards, panels (the most-used radius)
- `16px` — hero blocks, large feature cards
- `pill` — status badges, tags

Never circular except for avatars and round icon buttons.

### Layout rules

- **12-column grid** at 1280px max width for desktop content.
- **Header height fixed** at 64px.
- **Generous vertical rhythm** between sections — 96px (`--sp-24`) on desktop, 64px (`--sp-16`) on tablet.
- **Slide content** is set on a 1920×1080 canvas with a strong left/right margin (96–120px) and a clear "title strip" at the top.
- Slide titles get a consistent **left-aligned eyebrow + title pattern** plus a small horizontal teal rule under the eyebrow.

### Transparency & blur

Used **rarely**. Acceptable cases:
- Sticky header with `backdrop-filter: blur(12px)` and `background: rgba(255,255,255,0.85)` — the only place blur appears in the system.
- Duotone photo overlays — solid-color rectangles at 75–85% opacity over the photo.

No frosted-glass cards. No semi-transparent buttons.

### Imagery vibe

- **Cool color grading** preferred — slight desaturation, no warm filters.
- **Real photography** of civic/industrial/landscape subjects — never stock-photo office laptops.
- **Duotone treatment** in brand colors (teal + magenta) is the signature device for hero images. Reference: PPTX cover slide.
- **Black & white** imagery is acceptable for portrait headshots.
- No stylized 3D renders, no gradients-as-imagery, no AI-looking abstract shapes.

---

## ICONOGRAPHY

The source deck does **not** use a consistent icon library — most "icons" are actually small product logos (Apache NiFi feather, MinIO logo, Trino bunny, JupyterHub planet) and number badges. Where decorative icons appear, they tend to be **monochrome line icons** in navy or teal at consistent stroke weight.

### Approach

- **Vendor / product logos** ship as PNGs in `assets/product-logos/` (extracted from the PPTX). Use them at their native form when referencing a specific tool.
- **Generic UI icons** use **Lucide** via CDN — outline style, 1.5–2px stroke, rounded line caps. Lucide is closest in spirit to the deck's monochrome line treatment.

  ```html
  <script src="https://unpkg.com/lucide@latest"></script>
  <i data-lucide="database" class="d4n-icon"></i>
  <script>lucide.createIcons();</script>
  ```

- **Stroke weight** standard: 1.75px. Set via `stroke-width` on `<svg>` or pass `--lucide-stroke-width: 1.75` if using the loader.
- **Sizes:** 16, 20, 24, 32. Use 20 as default in body UI.
- **Color:** `currentColor` — icons inherit the surrounding text color. Default to `--fg-2`.
- **Pipeline / flow glyphs** — `→`, `▶`, `▼`, `·` — are typographic, not iconographic. Keep them as Unicode characters; they're part of the brand's content style.

### Substitution flag

⚠️ Lucide is a **substitute**, not a verified Data4Now choice. If Data4Now uses (or wants to standardize on) Heroicons, Phosphor, Material Symbols, or a custom set, swap accordingly and update this section.

### Emoji

**Not used.** The brand voice is technical/civic; emoji would undermine it. Do not introduce them in slides, marketing, or product copy.

### Logo & wordmark

The wordmark is the primary brand mark. Three components:
1. The **DATA / NOW** stacked navy letterforms (tightly set, condensed).
2. The **vertical "FOR" pillar** in teal between them.
3. The **pie-chart "O"** in the word "NOW" — navy with a magenta wedge.

Do not separate these into individual marks. The pie wedge is the only place magenta appears in the logo and should not be re-colored.

Logo files in `assets/`:
- `data4now-logo.png` — full color, transparent background

Clearspace: equal to the height of the "F" in "FOR" on all sides. Minimum on-screen width: 120px. Minimum print width: 1 inch.

---

## INDEX — what's in this folder

| Path | Purpose |
|---|---|
| `README.md` | This file — start here |
| `SKILL.md` | Agent-Skills-compatible loader |
| `colors_and_type.css` | All design tokens — colors, type, spacing, radii, shadows, motion |
| `fonts/` | Font notes (Montserrat + Roboto loaded from Google Fonts) |
| `assets/data4now-logo.png` | Primary wordmark |
| `assets/product-logos/` | Vendor logos referenced in materials (NiFi, MinIO, Trino, etc.) |
| `assets/pptx-media/` | Raw images extracted from the source deck |
| `preview/` | Design-system specimen cards (one HTML file per token group) — incl. `tables.html`, `doc-callouts.html`, `doc-page.html` for DOCX-style document work |
| `slides/` | Slide templates — `index.html` + per-layout JSX components, modeled on the STATIN deck |
| `ui_kits/website/` | Inferred marketing-site UI kit (homepage hero, features, pricing-style sections, footer) |
| `uploads/` | Original user-supplied files (don't edit) |

---

## How to use this system

- **For decks:** start from `slides/index.html` — it loads `colors_and_type.css` and the slide templates. Pick a layout, fill in content, swap imagery from `assets/pptx-media/` or supply your own.
- **For marketing surfaces:** start from `ui_kits/website/index.html`. Components live as JSX modules — import what you need.
- **For tokens in any new file:** `<link rel="stylesheet" href="path/to/colors_and_type.css">` and use the CSS variables. Don't hardcode hex values.
