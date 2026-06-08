# Velo — Project Status

> Rolling changelog so any incoming agent can get up to speed fast. Newest entry on top.

---

## Session — orb icons (landing clay-badge), notification wipe fix

**App (build-verified)**
- **Notifications no longer wipe on transient session expiry.** The `SIGNED_OUT` handler fires on
  both real logout AND Supabase session expiry; it was calling `setNotifications([])`, so on every
  silent expiry/re-auth the bell blanked until a manual refetch — the "disappear, come back on
  refresh" symptom. Removed the wipe from that path; explicit logout + account deletion still clear.
- **Dashboard icons rebuilt as the landing's clay-badge orbs.** Dropped the flat rounded-square
  tiles for circular orbs matching the landing's `.clay-badge` / `.orb-av`: single clean gradient,
  strong colored glow, glossy top highlight, inset rim, white glyph, gentle float. Palette in the
  landing's violet-centred oklch range (amber/green/violet/blue/cyan). Verified old-vs-new render.

**IMPORTANT — stale build:** user screenshots show the OLD market cards (4 separate, purple
selection border) and OLD square icons → the previous deltas (market strip, first icon pass) had
not loaded. Service worker / deploy. Verify tell: new build = ONE connected market strip + round
glowing orb icons.

---

## Session — 3D icon tiles + market strip redesign

**App (fixed, build-verified)**
- **Dashboard section icons upgraded to dimensional "3D" tiles (`Ico3D`).** Replaced the flat
  gradient squares with glossy tiles: specular top-left highlight, bottom inner shade, inset rim
  light/dark, white glyph with drop-shadow, and a soft *colored* drop-shadow glow per tile (the
  floating feel). Added a gentle continuous float (`@keyframes veloFloat` in brand.css, with a
  `prefers-reduced-motion` off-switch). Palette moved off the loud rainbow
  (orange/lime/magenta/violet/cyan) to a brand-cohesive set: amber (Performance), green (On-chain),
  violet (Margin), blue (Positions), cyan (Activity). Verified via headless render.
- **Social market cards → connected terminal strip (`TopTokensBar`).** The heavy 2×2 floating
  cards became one clean glass strip with hairline-divided cells (responsive `auto-fit`), tighter
  type, and a slightly taller inline sparkline. Frees vertical space and reads far more
  professional. Verified via headless render.

**Still open (broader / needs direction)**
- Full social *page* restructure beyond the market strip (sidebar panels, feed cards, composer)
  is larger and subjective — recommend tackling one section at a time with a render preview each.

---

## Session — fix console errors (service worker, wallet URL, link proxy)

**App (fixed, build-verified)**
- **Service worker rewritten (`public/sw.js`, cache `velo-v2`).** Root of most console spam:
  it tried to `cache.put` `chrome-extension://` requests (wallet extensions) and cross-origin
  error/opaque responses, and its navigate handler could resolve to `undefined` →
  "Failed to convert value to 'Response'". Now it only touches same-origin http(s) GETs, caches
  only clean same-origin 200s, lets all cross-origin + `/api/` through natively, and always
  returns a real Response for navigations. Bumping to `velo-v2` purges the stale `velo-v1` cache.
- **Wallet metadata URL fixed (`web3Config.ts`).** Reown/WalletConnect `metadata.url` + icons +
  token image were hardcoded to the old `velo-trading-terminal.vercel.app`; the mismatch with
  `app.velotrading.live` triggered the WalletConnect warning and can break connection (likely a
  contributor to the flaky sign-on). Now `app.velotrading.live`.
- **Link previews via own serverless endpoint (`api/og.js`).** Replaced the public
  `api.allorigins.win` proxy (blocked by CORS from the app origin) with a same-origin Vercel
  function that fetches + parses OG metadata server-side and edge-caches it — fast, reliable,
  no CORS. `LinkPreviewCard` now calls `/api/og?url=`.

**Notes**
- `cdn.tailwindcss.com` production warning remains (the app uses Tailwind utility classes via the
  CDN; moving it to a build dependency is a separate, riskier change — left for now).
- Supabase auth-lock warning is benign (gotrue recovers; React StrictMode artifact).

---

## Session — clean glass shadow, blend equity chart

**App (fixed, build-verified)**
- **Glass shadow simplified.** The old `--glass-shadow` stacked a top highlight, an inner ring,
  a bottom dark inset, and a heavy 40/90px drop shadow — that busy "double-edge" is the weird
  look on every panel. Reduced to a faint top edge + one soft drop shadow
  (`0 1px 0 rgba(255,255,255,0.04) inset, 0 14px 36px -26px rgba(0,0,0,0.7)`).
- **Equity chart now blends.** `PortfolioChart` painted a solid `#0e0d14` background, so it sat
  as a distinct dark rectangle inside the glass panel. Set the chart background to transparent
  and faded the area fill fully to 0 alpha so it melts into the panel.

**Open / needs more than a blind edit**
- *Notifications not working* and *history/recent-activity not capturing the latest large
  position*: both are data-layer (Supabase). Notifications only populate from rows written to the
  `notifications` table; history relies on `trade_history` + its public-read RLS policy. The
  pending Supabase migrations (`trade_history` RLS, `verified_reason`) likely need to be run, and
  the rest needs debugging against the live app + DB — not safe to fix blind.
- *3D animated icon set like the landing*: the landing's step/bento icons are inline SVG/CSS, not
  reusable asset files, so matching them in the app is a dedicated design build, not a swap.
- *Social restructure / "markets shown differently"*: needs a concrete target layout.

---

## Session — remove copytrade UI, align meta, fix blog font

**App**
- **Copytrade removed everywhere it surfaced** (it isn't a working feature yet): the social
  "Copytrade · Live" signals panel, the "Copy trade" buttons on trade-signal posts, the
  "Copy Trader" button on profiles, and the leaderboard podium "Copy Trader" label (now
  "View Profile" — the button already navigated to the profile).
- **SEO/meta aligned with the landing.** App `index.html` title + OG/Twitter title now read
  "Velo — Provable. Social. On-chain." and the OG/Twitter description matches the landing's
  ("A SocialFi perpetual futures terminal on Base. 17 markets, up to 25× leverage, Pyth-priced
  fills — every trade provable on-chain."). Removed the old "copy trading / Don't trust it"
  wording. Default in-app document title aligned too.
- `vite build` ✓.

**Landing**
- **Blog widget font corrected** to match actual branding: the `/blog` post titles use Geist
  sans 600, not Fraunces — so the homepage "Latest writing" heading and card title are now
  Geist sans (was the off-brand Fraunces italic).

**Still open:** Dashboard tab-click freeze + sign-on race (need a live repro detail); in-feed
rich-link "like X" polish (separate pass). Further social-page visual polish is decluttered via
the copytrade removal — happy to target specific elements if flagged.

---

## Session — minimal OG, social cards, font simplify, trade fixes

**Landing**
- OG image reverted to a truly minimal mark: single-colour bone "Velo" (no gradient), no top
  text, faint neutral glow, `PROVABLE · SOCIAL · ON-CHAIN` below.
- Blog widget pinned to the brand Fraunces serif ("Latest writing" + card title italic).

**App**
- **Font simplified.** All `S.display` definitions (App.tsx ×9 + Dashboard.tsx) flipped from
  Fraunces *italic* to upright Fraunces — keeps the brand serif (so it still matches the landing)
  but drops the fussy slant on section labels, usernames, the equity figure, etc. Wordmark stays
  italic everywhere.
- **Social market cards** (`TopTokensBar`) made compact (padding 10→9, gap 8→6, sparkline 24→18,
  price 14→13) and given `var(--glass-shadow)` so they read as the same material as the panels
  (they were the same fill but lacked the shadow → looked flatter/"more transparent").
- **Trade history** rows put on one line (left column is now a horizontal flex; pair/side/action
  and entry/size/PnL sit inline instead of stacked).
- **Cost label** → "Margin (cost)" (behaviour was already correct: margin = cost, size = notional).
- **Market selector** (`PairSelector`) anchored top-left instead of dead-centre on open.
- `vite build` ✓.

**Still open** (need a live repro, not safe to fix blind): Dashboard tab-click freeze
(pointer/z-index — need to know if hovering tabs shows a pointer cursor); sign-on chain-switch
race. In-feed rich-link cards rendering "like X" is a separate feature pass.

---

## Session — header material match, minimal OG, docs refresh

- **Header now uses the exact panel material.** Root cause of the "header is a different colour"
  issue: the nav forced `blur(44px) saturate(1.9)` with an obsidian fill, while every dashboard
  panel uses `var(--glass-bg)` + `var(--hairline)` + `blur(8px) saturate(1.1)` + `var(--glass-shadow)`.
  Matched the navbar to that exact recipe (and removed the interim `--nav-bg` token), so the header
  reads as the same frosted glass as the cards in both themes.
- **Landing OG simplified** to the minimal brand mark — the Fraunces italic "Velo" wordmark
  (white→violet→blue) on near-black with `PROVABLE · SOCIAL · ON-CHAIN`, matching the shared
  reference. Replaces the busier key-art version.
- **Docs refreshed** (`README.md`, `FEATURES.md`, `VELO_Overview.md`): the domain split
  (terminal → `app.velotrading.live`, marketing → `velotrading.live`) and the "Obsidian glass"
  brand identity now applied across both surfaces. (`VELO_Overview.md` is the exec/"CEO" brief.)
- `vite build` ✓.

---

## Session — SEO/routing, OG images, blog section, navbar blend

**App**
- **Header now matches the page.** The floating nav pill used `--glass-bg` (frosted *white*),
  which read as a lighter band over the obsidian page. Added a `--nav-bg` token tinted with the
  page's own background (`color-mix(in oklab, var(--bg) 72%, transparent)` dark; near-white light)
  and pointed the navbar at it, so the header reads as the same colour as the page, just frosted.
- **OG image** set to the branded testnet key-art (`public/og-image.png`, 1200×630). Meta already
  referenced `app.velotrading.live/og-image.png`.
- `vite build` ✓.

**Landing** (separate `velo-landing` repo)
- **Blog moved to a nested, SEO-correct route:** `/article-velo-testnet` → `/blog/velo-is-live-on-base-sepolia`
  (file under `blog/`). All asset refs made root-absolute so nested routes don't break.
- **Full SEO pass:** canonical, robots, theme-color, Open Graph + Twitter cards on every page;
  JSON-LD (Organization + WebSite on home, TechArticle on docs, Blog on the index, BlogPosting +
  BreadcrumbList on the post). Added `sitemap.xml` and `robots.txt`.
- **Branded OG image** generated for the landing (`assets/og-image.png`, 1200×630).
- **"Latest from the blog"** featured-post section added to the homepage under the "Don't trust it.
  Check it." closer.

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
