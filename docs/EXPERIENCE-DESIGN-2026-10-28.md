# Velo interface direction — 28 October 2026

The approved landing composition was restored to commit `3755695`; the rejected split hero, replacement sharing chapter, FAQ and closing glyph are removed. The later brand-foundation stylesheet shares the app's Switzer interface font and graphite/celadon materials across the landing page, docs and blog. The laptop, captions, page structure and sequence retain their prior implementation.

## Typeface comparison

Compared **Satoshi, General Sans, Switzer, Supreme, Cabinet Grotesk and Clash Grotesk** using the same navigation labels, market copy, currency values, signs, percentages and ambiguous characters. The resulting specimen is kept as a local review artifact. Switzer 400/500/600/700 is the app interface family: its compact metrics and clear numerals fit dense controls and financial tables. Fraunces remains Velo’s wordmark/editorial face; Geist Mono remains available for technical identifiers and compact labels. Font files are unmodified, local and attributed in [third-party notices](../THIRD-PARTY-NOTICES.md). PNG rendering explicitly loads the interface weights before drawing.

## Reference review and actual implementation

| Reference | Reviewed patterns | Current Velo implementation |
| --- | --- | --- |
| [21st](https://21st.dev/) | Liquid glass, background paths, living gradients, glyph portal | Existing landing background traces remain in the restored design. App navigation/overlays retain a glass material with one moving active lens. The rejected replacement hero/portal is removed. |
| [Motion Primitives](https://motion-primitives.com/docs) | Animated Background, Transition Panel, Morphing Dialog, Sliding Number | Spring-driven native selection controls; conditional price-field height animation. Native dialog accessibility/focus handling stays in place. Source registry inspected; no competing dialog framework installed. |
| [React Bits](https://reactbits.dev/) | Animated Content, Glare Hover, Glass Surface, Glass Icons and background collections | Original low-cost sheen on interactive buttons; small card entrances. No WebGL dependency or delayed financial data. |
| [Amicro](https://amicro.dev/) | Button slide/morph states, loaders, Mono Charts; available indexed catalogue at amicro.vercel.app | Action labels swap with short motion, mini-charts show actual nearest historical values. Direct site access returned a security checkpoint, so these are original implementations of the observed patterns, not copied Amicro source. |
| [Bencho](https://bencho.dev/) | Price chart, resizable panels, Morph loader, Copy field, Private balance, Toast stack and Sounds | Resizable trade rail and historical chart readout; compact pending loader; reusable copy/check feedback in position receipts with explicit failure. Interface sounds are optional in Wallet & Settings, off by default, generated locally with one reused audio context and duplicate-cue suppression. No third-party sound recording is redistributed. |
| [beUI](https://beui.dev/) | StatefulButton, RangeSlider, motion tokens, Morphing Modal | Adapted MIT spring parameters/content swaps in `ProductMotion.tsx`; native margin input with tick marks and spring fill; spring selection in navigation and segmented controls. Source and license retained. |
| [Magic UI theme toggle](https://magicui.design/docs/components/animated-theme-toggler) | Button-origin View Transition reveal | Existing interruptible circular theme transition retained, with immediate reduced-motion/unsupported fallback. |
| [Rune Icons](https://www.runeicons.com/) | Five icon styles and glass artwork | Original Apache-2.0 glass wallet illustration used in the compact signed-out ticket. Existing Lucide controls remain consistent. License retained. |
| [Reicon Glass](https://reicon.dev/glass) | Translucent icon layers, highlights and controlled depth | Material reference; no additional remote icon runtime or unlicensed downloaded asset. |
| [Rolling Number](https://rolling.kitlangton.dev/) | Direct/interruptible rolling values and locale-aware precision | Existing coverage retained across financial values, charts’ DOM readouts and social metrics. New chart hover readout uses the same engine. Native chart axes and exported PNGs remain native/static. |
| [Fontshare](https://fontshare.com/) | Six actual font families rendered against the same product copy | Switzer across app and public site interface text; Fraunces and Geist Mono retain their existing roles. |

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

## Material and alignment follow-up

Light mode uses `#eff3eb` for the canvas and `#f5f7f0` for solid surfaces. Social's discovery modules, market watch and feed share the same container treatment. Market statistics gain a matching surface; leaderboard podiums and table use the same quiet edges and reduced shadows. Desktop navigation and trading panels share 12 px outer gutters, a 64 px header and a 12 px content gap. On phones and tablets the header spans the viewport with safe-area padding, matching the edge-to-edge trading layout. Account-number line height allows rolling digits to remain fully visible.

The six requested component catalogues were revisited, including beUI's free/Pro separation and Bencho's sound collection. Velo uses original implementations of the reviewed patterns or already credited open-source adaptations. The follow-up adds no paid source or unverified sound asset. New copy-failure and sound-preference tests bring the app suite to 232 passing tests; all 17 landing tests still pass.


## Mobile persistence, notification undo and detail dialogs

Mobile wallet transports can report `connecting` during reload. This is no longer interpreted as a click. Only account-choice buttons arm the sign-in continuation (for five minutes); the normal path reuses an unexpired session whose server-verified wallet matches. The Supabase refresh mechanism and existing inactivity/absolute limits remain enabled.

Notifications now carry a server-assigned actor and nullable `retracted_at`. Private delete triggers retract likes, comment likes, reposts and follows. Event validation and shared advisory locks prevent a late client retry from recreating an undone event. Re-liking creates a new active event. Recipient RLS is unchanged. The client removes retracted rows on Realtime UPDATE and remembers their IDs so a stale in-flight snapshot cannot reinsert them. Post/reply deletion also prompts a debounced notification refresh to cover PK-only Realtime DELETE delivery. Nine existing stale social alerts were retracted; no financial alerts were retracted.

The mobile market watch presents all four assets in a two-by-two grid. Desktop Social uses a wider 760 px reading column with 230/260 px discovery rails. Feed PnL images keep their 420 px limit. Light celadon is slightly greener (`#eaf1e8` canvas, `#f1f6ee` solid surface), shared with the public site. A fixed top veil masks the strip above the translucent header during scrolling.

Trade/order/history/transfer details now use the same native glass dialog as sharing. A compact hero and paired facts precede an animated execution-details disclosure; explanations expand in place, so they work on touch and remain inside the modal top layer. The footer remains available during scrolling. V4 position return uses collateral plus the opening fee, matching the other position summaries. Like/repost icons get a short spring response without remounting the focused control. These use the existing Motion runtime and the previously reviewed Motion Primitives/beUI/Amicro interaction patterns; there are no new dependencies, paid components or sound assets.

The landing laptop's entry placement now starts shortly after the ticker before smoothly joining its existing pinned camera path. The closed-first zoom/open/tour/close sequence, device geometry and captions remain intact. On the 390 × 844 browser check the visible closed lid begins about 81 px after the ticker, instead of over 400 px later.

Validation: 238 app checks, 18 landing checks, TypeScript and production packaging; live Supabase rollback-only SQL tests cover canonical event validation, deduplication, undo/relike, late retry, anonymous denial, recipient RLS and deletion cascades. Browser checks cover four visible phone markets, no horizontal page overflow, both detail-dialog themes and keyboard containment. Responsive browser checks do not establish physical MetaMask-mobile behavior.


## Coin workspace and continuous phone terminal

The coin page is now a responsive chart-first workspace with four evenly grouped reference statistics, a quieter asset/resources card and its own conversation composer. It retains the current Switzer/celadon/graphite materials. The composer adds a single matching cashtag, supports the shared @/$ picker and publishes through the existing main-feed handler. Confirmed posts clear the draft; an unconfirmed publication leaves it editable. Related markets are native buttons, and the old 50× shortcut copy is removed.

The six current catalogues were reviewed again, including the live Amicro and Motion Primitives sites (browser access succeeded this time): Motion Primitives’ disclosure and transition patterns, React Bits’ content/micro collections, Amicro’s stateful buttons/loaders/charts, Bencho’s Price Chart and sound collection, beUI’s 54 motion components and 24 blocks, and Magic UI’s component catalogue/bento/interactive-button examples. This pass applies grouped bento information, native spring selection controls, an animated price trace, keyboard/touch chart scrubbing with actual timestamps, height disclosure, bookmark feedback, stateful publication and responsive resource-link arrows. These are original adaptations using the existing Motion runtime and credited earlier primitives; no paid source, extra UI framework or sound asset was imported. Existing interface sounds remain opt-in and off by default.

Phone/tablet trading sections share one flush surface with hairline separators; the chart, ticket and public feed no longer have competing rounded outer cards or gutters. Desktop rail sizing and execution handlers remain unchanged. The public laptop’s closed-shell artifact was traced to a ground-shadow plane overlapping the metal lid and an exposed hinge. Contact lighting now follows the projected deck front edge; screen/base shadows no longer cross the lid, and the hinge/keys reveal with opening. The approved camera/hinge sequence and captions are retained. Landing bento market icons now link directly to the corresponding asset workspaces with keyboard and hover feedback.

Verification for this pass: 242 app checks plus TypeScript/production packaging. Coin workspace browser frames at 390 px and 820 px have no horizontal overflow. Local publishing confirms mention selection, automatic cashtag insertion and a normal post in the coin conversation; the actual app’s composer delegates to its shared feed handler. The mobile trade chart/ticket/feed resolve to the same surface with zero outer corner radius. Laptop closed-pose browser inspection confirms that the contact-shadow band no longer intersects the lid. No public post or trade was submitted.

The workspace sizing reset explicitly preserves rolling-number glyph slots as `content-box`. Their measured character width excludes overhang padding; overriding that contract clips narrow digits, most visibly in the small chart captions. Live capture and computed glyph/slot widths were checked after the correction.
