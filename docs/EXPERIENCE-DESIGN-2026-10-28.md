# Velo interface direction — 28 October 2026

The approved landing design is restored to commit `3755695`; the rejected split hero, replacement sharing chapter, FAQ and closing glyph are removed. The laptop and captions retain their prior implementation. App changes are independent of that rollback.

## Typeface comparison

Compared **Satoshi, General Sans, Switzer, Supreme, Cabinet Grotesk and Clash Grotesk** using the same navigation labels, market copy, currency values, signs, percentages and ambiguous characters. The resulting specimen is kept as a local review artifact. Switzer 400/500/600/700 is the app interface family: its compact metrics and clear numerals fit dense controls and financial tables. Fraunces remains Velo’s wordmark/editorial face; Geist Mono remains available for technical identifiers and compact labels. Font files are unmodified, local and attributed in [third-party notices](../THIRD-PARTY-NOTICES.md). PNG rendering explicitly loads the interface weights before drawing.

## Reference review and actual implementation

| Reference | Reviewed patterns | Current Velo implementation |
| --- | --- | --- |
| [21st](https://21st.dev/) | Liquid glass, background paths, living gradients, glyph portal | Existing landing background traces remain in the restored design. App navigation/overlays retain a glass material with one moving active lens. The rejected replacement hero/portal is removed. |
| [Motion Primitives](https://motion-primitives.com/docs) | Animated Background, Transition Panel, Morphing Dialog, Sliding Number | Spring-driven native selection controls; conditional price-field height animation. Native dialog accessibility/focus handling stays in place. Source registry inspected; no competing dialog framework installed. |
| [React Bits](https://reactbits.dev/) | Animated Content, SpotlightCard, background collections | Existing restrained transitions remain. No WebGL hero, cursor trails or shaders are added to the trading workspace. Financial data stays visible immediately. |
| [Amicro](https://amicro.dev/) | Button slide/morph states, loaders, Mono Charts; available indexed catalogue at amicro.vercel.app | Action labels swap with short motion, mini-charts show actual nearest historical values. Direct site access returned a security checkpoint, so these are original implementations of the observed patterns, not copied Amicro source. |
| [Bencho](https://bencho.dev/) | Price chart, resizable panels, Morph loader | Existing pointer/keyboard-resizable trade rail retained; compact historical chart readout added. Original square/circle loader used only during actual pending operations. No additional sounds. |
| [beUI](https://beui.dev/) | StatefulButton, RangeSlider, motion tokens, Morphing Modal | Adapted MIT spring parameters/content swaps in `ProductMotion.tsx`; native margin input with tick marks and spring fill; spring selection in navigation and segmented controls. Source and license retained. |
| [Magic UI theme toggle](https://magicui.design/docs/components/animated-theme-toggler) | Button-origin View Transition reveal | Existing interruptible circular theme transition retained, with immediate reduced-motion/unsupported fallback. |
| [Rune Icons](https://www.runeicons.com/) | Five icon styles and glass artwork | Original Apache-2.0 glass wallet illustration used in the compact signed-out ticket. Existing Lucide controls remain consistent. License retained. |
| [Reicon Glass](https://reicon.dev/glass) | Translucent icon layers, highlights and controlled depth | Material reference; no additional remote icon runtime or unlicensed downloaded asset. |
| [Rolling Number](https://rolling.kitlangton.dev/) | Direct/interruptible rolling values and locale-aware precision | Existing coverage retained across financial values, charts’ DOM readouts and social metrics. New chart hover readout uses the same engine. Native chart axes and exported PNGs remain native/static. |
| [Fontshare](https://fontshare.com/) | Six actual font families rendered against the same product copy | Switzer adopted in the app only. Landing typography is restored with its prior design. |

The new runtime dependency is pinned Motion. The existing rolling-number dependency is retained. Source-based beUI adaptations and Rune artwork are listed in [third-party notices](../THIRD-PARTY-NOTICES.md).

## Trading colour and proportion correction

The old chart canvas hardcoded `#f1f5f2` in light mode. The current surrounding panel used a different surface. CSS now owns `--trade-surface` and chart tokens; the chart reads resolved literal colours and paints a transparent canvas over the same solid surface. A theme-class observer updates the canvas palette after the root theme commits, without recreating the chart.

The desktop signed-out rail gives the market feed the available height and keeps a compact sign-in ticket at its foot, replacing the stretched empty sign-in card. Authenticated order entry keeps the adjustable feed/ticket split and persistent submit action. Market/Limit/Stop and Long/Short are native keyboard-accessible buttons with spring indicators. Conditional fields reveal inside the existing ticket; changing type does not replace the submit element. Collapsed fields are inert and hidden from assistive technology. The margin slider retains native pointer, touch and keyboard behavior; its decorative fill animates separately.

The new market-watch sparkline uses actual returned history, unique gradient IDs and a nearest-point quote readout. It makes no extra network requests and introduces no simulated market ticks.

## Sharing and accessibility

Feed PNG previews remain bounded at 420 px, preserve 3:2 proportions, and open beside the same post/actions/comments. Exports remain 2400 × 1600. Tagging and live-position settlement behavior are unchanged.

Motion is presentation-only. Native inputs, handlers, disabled/busy gates and calculation precision remain intact. Unsupported animation engines and reduced-motion settings get immediate state changes. New decorative loaders have no role in transaction confirmation. Keyboard focus remains on selected controls.

## Verification

All 230 app regression tests, TypeScript and the production build passed. The suite covers persistent trade-ticket/keyboard navigation and chart token resolution. Landing restoration passed 17 tests and was confirmed live. Browser control was subsequently restored: visual checks covered the trading page in light/dark, social density and 420 px image previews, and the native order-type/slider controls in an authenticated UI fixture. Chart and panel computed colours match in light mode (`rgb(248, 250, 242)`) and share the dark surface. A 390 px browser frame measured equal client/scroll width; this is responsive browser evidence, not a physical-phone test. No transaction or social post was submitted by these checks.
