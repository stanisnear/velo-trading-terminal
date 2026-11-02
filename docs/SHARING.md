# Share the trade behind the idea

Velo offers two formats: a compact position attachment for the conversation, and a PnL image for a visual result. Both connect a trader's post with the trade it describes.

## Position attachment

Choose **Position** in the Social composer and select an open trade. Add your note and choose whether to show invested amounts or return percentage. The attachment shows market, direction, leverage, prices and status in a compact section of the post.

The attachment follows the linked position through settlement. Readers can open **Position details** for opening/closing times, the position ID and available transaction links. Times use the viewer's locale and time zone.

Use the same flow from the terminal or trade history. A completed close offers an optional **Share** action inside the result flow.

## PnL image

Choose **PnL image** to open the sharing studio:

1. Select amounts or **% Return only**.
2. Choose **Light card** or **Dark card**, independently of the app theme.
3. For an open position, choose a live post or a fixed capture under **Post updates**.
4. Add a note, then **Post to Velo**, save the PNG or share through your device.

Every new image uses the **Clean** Velo layout. Exports use a **2400 × 1600** canvas, load the Velo fonts before rendering and fit long values without stretching the typography.

## Live posts and captured moments

| Choice | While the position is open | After settlement |
| --- | --- | --- |
| Position attachment | Follows current position state | Shows confirmed status and result |
| PnL snapshot | Preserves the captured image and time | Keeps the same capture |
| Keep this post live | Animates current marks and PnL within Velo | Shows the settled result as a static card |
| Keep the captured PnL when the position closes | Follows the open position | Retains the selected capture with a closed-snapshot label |

Live cards update persistent text and rolling numbers in place. Visible shares check chain state approximately every ten seconds and use current marks between those reads. Offscreen cards pause updates. At settlement, the card retains its layout while the static image loads.

Downloaded PNGs preserve the moment they were exported. Amount controls change the presentation of the post; transaction details remain publicly inspectable on-chain.

## Images and conversation

The feed uses a bounded 3:2 preview aligned with the post text. Open the image to view its original post, actions, reactions and comments beside it on desktop or below it on mobile. Closing the viewer returns focus to the preview.

Posts use short links at `/p/<post>`, with replies at `/p/<post>/r/<reply>`. Link previews lead readers back to the same conversation.

## Tag people and assets

Type **@** for people or **$** for assets in any post, reply, comment or sharing note. Select a suggestion with touch/mouse, arrow keys and Enter, or Tab. Escape closes suggestions while preserving the draft.

Coin pages use the same composer and reply components. A post started there receives the coin's $tag and appears in both its discussion and the main feed.

## Implementation map

| Component | Responsibility |
| --- | --- |
| [`VeloShareCard.tsx`](../src/components/VeloShareCard.tsx) | Studio, export and publication |
| [`PositionComposerTools.tsx`](../src/components/PositionComposerTools.tsx) | Position selection in the composer |
| [`ShareValueControl.tsx`](../src/components/ShareValueControl.tsx) | Amount/percentage preference |
| [`SocialTextField.tsx`](../src/components/social/SocialTextField.tsx) | Shared mention and asset completion |
| [`PostCard.tsx`](../src/components/social/PostCard.tsx) | Feed and expanded conversation viewer |
| [`SharedPositionCard.tsx`](../src/components/SharedPositionCard.tsx) | Compact attachment |
| [`PositionDetailsDialog.tsx`](../src/components/PositionDetailsDialog.tsx) | Position context and receipt links |
| [`useSharedTrade.ts`](../src/components/useSharedTrade.ts) | Live state and settlement reads |

[Feature guide](../FEATURES.md) · [Execution](EXECUTION.md) · [Architecture](ARCHITECTURE.md)
