# Velo experience direction — 28 October 2026

Velo remains a trading product with a native social layer: positions and results can be inspected, rather than treated as unverified screenshots. Keep the Fraunces wordmark/editorial headings, readable Geist interface text and Geist Mono for financial data. Sage signals state; neutral surfaces carry content. Motion explains changes without delaying actions.

## Reference review and implementation decisions

| Reference | Patterns evaluated | Velo decision |
| --- | --- | --- |
| [21st](https://21st.dev/) | Liquid glass, Background Paths, living gradients and Glyph Portal | Original, low-opacity SVG traces and a slow sage light field in the landing hero. Glass is reserved for navigation/overlays. No shader runtime or glyph effect behind charts, forms or financial values. |
| [Motion Primitives](https://motion-primitives.com/docs) | Animated Background, Morphing Dialog, Animated Number, Text Effect | One sliding selection lens; compact focused media dialog; short enter/press transitions. Native dialog accessibility is retained. |
| [React Bits](https://reactbits.dev/) | Aurora and other animated backgrounds | Soft ambient movement on the landing hero, implemented with CSS/SVG. No WebGL dependency or perpetual JavaScript render loop. |
| [Amicro](https://amicro.dev/) | Morphing buttons, loaders, restrained monochrome charts | Button labels retain their width during loading; spinner overlays the original label. Small icon/press feedback; existing real chart data and chart renderer stay intact. |
| [Bencho](https://bencho.dev/) | Rolling counters, selection pills, like/reaction feedback, sounds | Small selection and reaction feedback; retain existing sound preferences/behavior. No new unsolicited sounds or paid source copied. The supplied /blocks/ path returned 404; its Browse blocks link leads to the current home directory. |
| [beUI](https://beui.dev/) | Tabs, morphing panels, action swaps, theme reveal | Shared sliding filters for feed/portfolio, more compact overlays and progressive theme reveals. No separate competing component framework. |
| [Magic UI theme toggle](https://magicui.design/docs/components/animated-theme-toggler) | Button-origin circular View Transition | Original helper in app and landing. Immediate change with unsupported/reduced-motion browsers; rapid changes can interrupt. Theme transition layer does not intercept pointer input. |
| [Rune Icons](https://www.runeicons.com/) | Outline, duotone and glass icon styles | Keep the existing Lucide glyph system; use a restrained glass housing for dashboard icons. Avoid mixing icon families and shipping another icon library. |
| [Reicon Glass](https://reicon.dev/glass) | Glass icon depth and highlights | Reference for small material details, not a remote runtime asset dependency. Local, consistent outlines remain legible. |
| [Rolling Number](https://rolling.kitlangton.dev/) | Interruptible, locale-aware number motion | Install @kitlangton/rolling-number 0.4.1 (MIT). Use for account/equity, margin and buying power. Native animation playback; no React updates per frame. Respect offscreen/reduced-motion behavior. |
| [Fontshare](https://fontshare.com/) | Satoshi, General Sans and Sentient alternatives | Retain Geist/Fraunces instead of introducing a fourth type family. Improve hierarchy through sentence-case navigation, weight, spacing and content width. Brand/export typography remains consistent. |

These are design references, not a claim that all their packages were installed. The rolling-number package is the only new runtime dependency in this release; other changes use Velo's own components and CSS/native browser APIs.

## Social media proportions

- Social page max width: 1080 CSS px; discovery rail 260 px; the rest is the reading column.
- PnL/image feed preview: at most 420 × 280 CSS px, aligned with the post text. Original 3:2 image is contained, never cropped or stretched.
- Full PNG export/upload remains 2400 × 1600. Display size does not change image resolution.
- Desktop viewer: at most 1080 px wide and 590 px high; 320 px discussion rail. Translucent backdrop and surface have opaque fallbacks.
- The visible “Post image” heading bar is removed. An accessible title still labels the native dialog; the close control stays visible.
- Smaller screens stack image and discussion. Escape, focus restoration, comment/reply tagging and existing post actions remain connected to the same post.

## Interaction boundaries

Rolling numbers animate presentation only; balances, account calculations and order submission remain unchanged. Financial tables, chart axes and execution controls do not wait for reveals. Theme transitions start at the actual toggle and fall back immediately when motion is reduced. Feed/portfolio filters have native buttons, pressed state and Arrow/Home/End support. Toasts wrap on narrow screens, announce their status and have an explicit dismiss action.

Landing paths pause when the hero is offscreen or the tab is hidden. Reduced-motion preferences disable decorative movement; reduced-transparency preferences use legible opaque surfaces. The laptop geometry, hinge and scroll sequence are unchanged.
