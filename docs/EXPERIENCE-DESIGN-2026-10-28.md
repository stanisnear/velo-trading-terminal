# Velo experience direction — 28 October 2026

Velo remains a trading product with a native social layer: positions and results can be inspected, rather than treated as unverified screenshots. Use Satoshi from Fontshare for interface text and animated financial readouts, Fraunces for the Velo wordmark and selected editorial headings, and Geist Mono for compact technical labels. Warm celadon light canvases, ivory panels and one sage accent replace the grey cast. Motion explains changes without delaying actions.

## Reference review and implementation decisions

| Reference | Patterns evaluated | Velo decision |
| --- | --- | --- |
| [21st](https://21st.dev/) | Liquid glass, Background Paths, living gradients and Glyph Portal | Original background paths, pointer-responsive light on preview cards, a layered glass terminal preview and a V glyph with orbiting rings in the closing section. Decorative effects stay outside trading data. |
| [Motion Primitives](https://motion-primitives.com/docs) | Animated Background, Morphing Dialog, Animated Number, Text Effect | One sliding selection lens; compact media dialog; animated market/position-preview panels and native FAQ disclosures. Native dialog accessibility is retained. |
| [React Bits](https://reactbits.dev/) | Aurora and other animated backgrounds | Pointer-reactive edge light and a rebuilt feature bento, drawn with CSS/SVG. Hover work is coalesced with requestAnimationFrame; no idle WebGL render loop. |
| [Amicro](https://amicro.dev/) | Morphing buttons, loaders, restrained monochrome charts | Button labels retain their width during loading; spinner overlays the original label. Small icon/press feedback; existing real chart data and chart renderer stay intact. |
| [Bencho](https://bencho.dev/) | Rolling counters, selection pills, like/reaction feedback, sounds | Small selection and reaction feedback; retain existing sound preferences/behavior. No new unsolicited sounds or paid source copied. The supplied /blocks/ path returned 404; its Browse blocks link leads to the current home directory. |
| [beUI](https://beui.dev/) | Tabs, morphing panels, action swaps, theme reveal | Shared sliding filters for feed/portfolio, more compact overlays and progressive theme reveals. No separate competing component framework. |
| [Magic UI theme toggle](https://magicui.design/docs/components/animated-theme-toggler) | Button-origin circular View Transition | Original helper in app and landing. Immediate change with unsupported/reduced-motion browsers; rapid changes can interrupt. Theme transition layer does not intercept pointer input. |
| [Rune Icons](https://www.runeicons.com/) | Outline, duotone and glass icon styles | Keep the existing Lucide glyph system; use a restrained glass housing for dashboard icons. Avoid mixing icon families and shipping another icon library. |
| [Reicon Glass](https://reicon.dev/glass) | Glass icon depth and highlights | Reference for small material details, not a remote runtime asset dependency. Local, consistent outlines remain legible. |
| [Rolling Number](https://rolling.kitlangton.dev/) | Interruptible, locale-aware number motion | @kitlangton/rolling-number 0.4.1 (MIT) now covers market prices and changes, trading sizes, marks, margins, PnL, fees, position details, admin metrics, social counts and chart DOM readouts. Landing ticker and interactive preview use the same locally bundled engine. Canvas chart axes and exported PNGs remain native/static. |
| [Fontshare](https://fontshare.com/) | Satoshi, General Sans and Sentient alternatives | Adopt unmodified Satoshi 400/500/700, self-hosted with license attribution in app and landing. Remove the old Geist interface-font request. PNG rendering reads the same interface font token and waits for fonts to load. |

These are design references, not a claim that all their packages were installed. The rolling-number package is the only new runtime dependency in this release; other changes use Velo's own components and CSS/native browser APIs.

## Social media proportions

- Social page uses a centered three-column desktop layout: 210 px discovery, up to 660 px reading column, 240 px market watch. Tablet moves the market strip above the feed; mobile shows two compact market cards and places discovery after the feed.
- PnL/image feed preview: at most 420 × 280 CSS px, aligned with the post text. Original 3:2 image is contained, never cropped or stretched.
- Full PNG export/upload remains 2400 × 1600. Display size does not change image resolution.
- Desktop viewer: at most 1080 px wide and 590 px high; 320 px discussion rail. Translucent backdrop and surface have opaque fallbacks.
- The visible “Post image” heading bar is removed. An accessible title still labels the native dialog; the close control stays visible.
- Smaller screens stack image and discussion. Escape, focus restoration, comment/reply tagging and existing post actions remain connected to the same post.

## Interaction boundaries

Rolling numbers animate presentation only; balances, account calculations and order submission remain unchanged. Financial tables, chart axes and execution controls do not wait for reveals. Theme transitions start at the actual toggle and fall back immediately when motion is reduced. Feed/portfolio filters have native buttons, pressed state and Arrow/Home/End support. Toasts wrap on narrow screens, announce their status and have an explicit dismiss action.

Landing paths pause when the hero is offscreen or the tab is hidden. Reduced-motion preferences disable decorative movement; reduced-transparency preferences use legible opaque surfaces. The laptop geometry, hinge and scroll sequence are unchanged.

## Product redesign follow-up

The landing hero is now a split story/interactive terminal. Native market buttons update the sample pair, quote, return and destination; Arrow/Home/End selection is supported. All values are labeled illustrative. The rebuilt sharing chapter switches between a compact live-position example and a PnL-image example, with inspectable explanatory details. The feature bento, FAQ, closing glyph, typography and spacing use the same product system. No trading backend or laptop pose logic changes.

`AnimatedText` preserves callers’ existing signs, precision, currency and locale rather than re-parsing formatted money. Inputs, wallet hashes, timestamps and static images do not roll. The chart’s DOM readout uses its existing mark prop; no extra market-data request is introduced.

Validation for this follow-up: TypeScript, 229 app tests, full Cloudflare build, 17 landing tests and static packaging. Browser control remained disabled after the user enabled it, so new desktop/mobile visual approval is still outstanding; earlier browser evidence above belongs to the preceding release.
