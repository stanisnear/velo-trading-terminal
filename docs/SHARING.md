# Position sharing and PnL images

Reviewed 27 October 2026. These features run in the current Base Sepolia testnet app. They connect the conversation to a trade without making the social feed an execution or copy-trading service.

## Choose a format

| Format | What appears in a Velo post | Best for |
| --- | --- | --- |
| **Position** | A compact attachment with market, direction, leverage, status, entry, mark/exit and PnL | Discussing an open position and following its outcome |
| **PnL image** | A branded image with the trade's prices, return and status | Sharing a visual result on Velo or exporting a PNG |

In the Social composer, write a note and choose **Position** to pick an open position. The attachment appears above the composer actions; removing it preserves the note. **PnL image** opens the sharing studio. The terminal's position/history sharing actions also open that studio. After a confirmed close, the confirmation offers a small optional **Share** action rather than opening the publisher automatically.

## Sharing studio

1. Choose **Position** or **PnL image** and inspect the preview.
2. Choose **$ Amounts** or **% Return only**. The latter hides margin, position-size and monetary PnL values in the attachment and its details; market prices and the percentage return remain visible.
3. For an image, choose **Light card** or **Dark card** independently of the app theme. **Customize** contains the **Velo** and **Clean** layouts and live-post options.
4. Add a note and choose **Post to Velo**, or save/share the PNG. Native file sharing depends on device support; the app offers an image download when it is unavailable.

The amount toggle is a presentation preference, not a privacy or access-control boundary. On-chain trade data remains public, and previously exported images do not change when a later display preference changes.

## Live posts and snapshots

| Choice | While the position is open | After settlement |
| --- | --- | --- |
| **Position attachment** | Follows the linked position on Velo | Shows its confirmed closed/liquidated status and result |
| **PnL image, default snapshot** | Keeps the captured image and timestamp | Remains the captured image |
| **PnL image, Keep this post live** | Refreshes the image within Velo | Shows the confirmed settled result |
| **Live image, Keep the captured PnL when the position closes** | Follows the open position | Freezes the originally captured result with an explicit closed-snapshot label |

Downloaded and externally shared PNG files are always fixed snapshots. A live Velo post does not turn a downloaded image into a remotely updating file.

Visible live shares check chain state approximately every ten seconds and use available current marks between reads. Hidden/offscreen shares pause refreshes; connectivity and RPC failures can delay updates. Open-position PnL is an estimate, not a confirmed realized return. Settlement requires matching chain evidence rather than simply assuming that a position which disappeared was liquidated.

## Inspect a position

Click or keyboard-activate a compact position attachment to open **Position details**. It shows:

- Market, side, leverage, status and the selected amount/percentage presentation.
- Opening and closing times in the viewer's locale and time zone, plus the shared capture time.
- The position ID, fixed V4 engine link, and opening/settlement transaction links and copy actions when recovered.
- Explicit checking, delayed/unavailable receipt and retry states. Missing evidence is not silently labelled verified.

Receipt matching checks the Base Sepolia V4 engine, trader and position ID. Snapshot details may check the current chain position while the original post remains fixed; the dialog labels this distinction. This verifies the linked trade context, not the author's entire performance history or leaderboard rank. It is not a recommendation to follow or copy the trade.

## Implementation and release checks

| Concern | Source |
| --- | --- |
| Studio, export and publish actions | [`VeloShareCard.tsx`](../src/components/VeloShareCard.tsx) |
| Composer picker and amount preference | [`PositionComposerTools.tsx`](../src/components/PositionComposerTools.tsx), [`ShareValueControl.tsx`](../src/components/ShareValueControl.tsx) |
| Compact attachment and details | [`SharedPositionCard.tsx`](../src/components/SharedPositionCard.tsx), [`PositionDetailsDialog.tsx`](../src/components/PositionDetailsDialog.tsx) |
| Visibility-aware live refresh and receipt reads | [`useSharedTrade.ts`](../src/components/useSharedTrade.ts), [`sharedPosition.ts`](../src/services/sharedPosition.ts) |
| Public attachment validation and update semantics | [`tradeShare.ts`](../src/utils/tradeShare.ts), [`shareBehavior.mjs`](../src/utils/shareBehavior.mjs) |
| Image generation and feed rendering | [`tradeImage.ts`](../src/utils/tradeImage.ts), [`PnlImage.tsx`](../src/components/PnlImage.tsx) |

Posts carry validated share metadata. Snapshot PNGs use owner-scoped Storage writes and immutable URLs; live image posts render from updated share data. Social metadata never authorizes a trade or overrides V4 balances, protection or settlement.

Before releasing a sharing change, check both formats, preserved drafts, removal, independent image appearance, amount hiding in preview/export/details, live settlement/freeze labels, missing-receipt states and keyboard/modal focus. Use disposable fixtures for publishing or Storage writes; viewing a public position requires no new trade. See [Operations](OPERATIONS.md) and the [27 October release record](RELEASE-2026-10-27.md).
