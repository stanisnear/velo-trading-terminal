# Velo — Project Status

> Rolling changelog so any incoming agent can get up to speed fast. Newest entry on top.

---

## Session — v3.1 follow-ups (warmth + favicon + landing hardening)

- **App colors warmed up.** The v3 ambient was too cold/neutral. Reintroduced restrained
  brand violet/blue into `--ambient` (dark) and `--ambient` + `--app-bg` (light) — alive but
  well short of the old saturation. Tokens only; cascades app-wide.
- **App favicon restored** to the gradient-V tile (distinct from the landing, which uses a
  neutral obsidian-V favicon). App `index.html` SVG + canvas fallback reverted to the brand gradient.
- **Landing rendering hardened.** The deployed landing was rendering with giant un-styled SVGs —
  a serving failure where `landing.css` arrived partial (hero/nav styled, later sections not).
  Verified the files themselves are correct via headless Chromium (with and without JS). To make
  it deploy-proof, all CSS + JS are now **inlined into each HTML page** (no external css/js
  requests), so partial-CSS failures are impossible. Also switched the landing to **clean routing**
  (`cleanUrls`, extensionless links, no `#hash` in the address bar; section nav smooth-scrolls via JS).
- `vite build` ✓.

---

## Session — v3 "Obsidian glass" rebrand applied to the app

**Goal:** Bring the trading app in line with the new v3 landing brand ("Obsidian glass"),
sourced from the Velo Rebrand Kit (`REBRAND.md`) and the live landing `css/landing.css`
(the authoritative token values).

### What changed (token-driven, cascades app-wide)

**`src/styles/tokens.css`**
- Brand seeds retuned: `--velo-violet → oklch(0.58 0.22 292)`, `--velo-blue-ice → oklch(0.86 0.10 248)`,
  `--velo-mauve → oklch(0.74 0.15 318)`, `--velo-obsidian → #060709`, `--pnl-up → oklch(0.80 0.17 152)`.
- Added `--brand-gradient` (140° violet→blue) for thin accents only; `--prism`/`--prism-vivid`
  retuned to violet→blue (reserved for 2px hairlines, the verified tick, prism chips).
- Added `--accent` / `--accent-text` (dark `0.62 0.18 280` / `0.80 0.12 278`; light `0.52 0.19 280` / `0.46 0.17 280`).
- **Dark theme:** `--bg #060709`, `--fg #edeef2`, `--fg-2 #9a9ea9`, `--fg-3 #5c5f6a`,
  `--hr 0.08` / `--hr-2 0.14`, **real frosted glass** `--glass rgba(255,255,255,0.045)`,
  `--gl-edge 0.14`, new `--glass-ring 0.06`, deep landing-spec `--glass-shadow`
  (`… 0 40px 90px -38px rgba(0,0,0,0.9)`), near-neutral whisper `--ambient` (3 cool blooms).
- **Light theme:** `--bg #fcfbff`, neutral hairlines/chips `rgba(20,22,30,…)` (dropped the purple tint),
  `--glass rgba(255,255,255,0.62)`, whisper-neutral `--ambient` + `--app-bg` wash, purple-soft `--glass-shadow`.
- **Readability preserved:** `--glass-2` (a.k.a. `--glass-bg-strong`, used by modals/dropdowns)
  intentionally kept near-opaque (dark `rgba(14,16,24,0.86)`, light `0.90`) — the frosted `--glass`
  alone is too sheer over scrims. This is deliberate, not a missed token.
- Frostier global blur: panel backdrop `blur(24px)→blur(34px) saturate 1.8→1.6`; modals `→40px`.
- Light navbar neutralized to white frosted glass.

**`src/styles/brand.css`**
- `.glass*` blur → `34px saturate(1.6)` (light adds `brightness(1.05)`).
- `.glass-input:focus` now uses `--accent` instead of raw violet.
- **`.btn.primary` → neutral graphite glass** `linear-gradient(180deg,#2b2f3a,#14161c)` white text
  (brand spec: primary is graphite, not a gradient). Same in light (stays high-contrast on white).
- `body::after` screen sweep toned to a single whisper-faint accent.
- Modal top-accent hairline retuned to violet→blue brand hues.

**`src/components/ui/shared.tsx`**
- `Button` `primary` variant switched from the animated `--prism-vivid` to the graphite glass
  (matches the brand primary). Prism is now reserved for thin accents only.

**`index.html` + `public/manifest.json`**
- Brand casing `VELO → Velo`; copy aligned to brand voice (17 markets, up to 25×, Pyth, provable);
  `theme-color`/`TileColor`/manifest colors → `#060709`.
- Favicon: dropped the prism-gradient "V" chip → neutral obsidian tile with bone italic V
  (brand forbids the V-bug-on-colored-chip; an app-icon tile in obsidian keeps it legible).
- Canonical + OG/Twitter URLs repointed to `https://app.velotrading.live/` (the app's new home).

### Notes / follow-ups
- ~200 inline `oklch(… 295)` accent colors in `App.tsx` were left as-is: the 3° hue shift from the
  new 292 violet is imperceptible, and rewriting inline styles app-wide is out of scope/high-risk.
  If any specific surface still reads "old violet," point it out and it's a targeted fix.
- A few inline CTAs in `App.tsx` still use `--prism-vivid` directly (Launch/Connect/Trade). The shared
  `Button` and `.btn.primary` are now graphite; flag any remaining colorful CTA you want converted.
- The dead `Bug`/`VeloLogoBug` (V-monogram) component in `shared.tsx` is unused (the navbar already
  renders the unboxed Fraunces wordmark) — left in place as harmless dead code.

### Verification gate (passed)
- `tsc --noEmit`: 83 errors — the pre-existing viem/wagmi/AppKit type baseline (~80). None in edited files.
- `vite build`: ✓ built (only the pre-existing >1000 kB chunk-size warning).

### Deploy split (this session's other deliverable)
- Landing → `velotrading.live` (apex), app → `app.velotrading.live`. The app's `vercel.json`
  (crons + SPA rewrite) is unchanged. See `VELO_DEPLOY_GUIDE.md` for the Vercel + Namecheap steps.
