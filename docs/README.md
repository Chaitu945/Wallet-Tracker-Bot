# docs/

Static assets referenced by the top-level README — currently the screenshots.

## Regenerating the screenshots

The alert embeds are rendered by `scripts/demo.js`, which imports the **same**
`tradeAlertEmbed` and `pnlEmbed` functions the poller uses at runtime. The only
difference is the input: fixed fixtures instead of live wallet activity. So the
images show real output from the real formatter, and nothing is billed to your
Moralis or Alchemy quota.

1. Make sure `.env` has a working `DISCORD_TOKEN`.

2. Enable Developer Mode in Discord (**Settings → Advanced → Developer Mode**),
   then right-click the channel you want the demo posted in and choose
   **Copy Channel ID**.

3. Run:

   ```bash
   npm run demo -- --channel <CHANNEL_ID>
   ```

   It posts a header message followed by four embeds: a buy alert, a fresh-ape
   alert, a sell alert, and a PnL breakdown.

4. Screenshot each embed and save it here using the names below. Cropping out
   the header message is fine — the README captions state the data is sample
   data either way.

## Expected filenames

| File                  | Contents                                   |
| --------------------- | ------------------------------------------ |
| `alert-buy.png`       | A buy alert with market cap and chart link |
| `alert-fresh-ape.png` | A buy with the 🆕 Fresh Ape flag           |
| `alert-sell.png`      | A sell alert                               |
| `pnl.png`             | The `/pnl` per-token breakdown             |

Suggested capture settings, so the four images look consistent: Discord in
**dark theme**, window widened until the embed sits on one line-width, and the
message cropped to just the embed.

## A note on honesty

These images are sample data, not live trading signals. The README says so in
the captions, and the demo posts a header saying so in Discord. Keep it that
way — presenting rendered fixtures as live output is the kind of thing a
reviewer will ask about in an interview.
