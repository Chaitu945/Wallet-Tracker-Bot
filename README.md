# Wallet Tracker Bot

A multi-chain (Ethereum, BNB Chain, Polygon, Base, Arbitrum, Solana) Discord bot for
watching memecoin/token trader wallets. Tracks buys and sells in real time, flags when
a watched wallet apes into a freshly-launched token, and computes per-wallet PnL.

## How it works

- **Data source:** [Moralis](https://moralis.com) Wallet API — one API key covers both
  EVM chains and Solana, and returns decoded swap data.
- **New-token detection:** [DexScreener](https://dexscreener.com) (no key needed) — checks
  how old a token's liquidity pool is when a watched wallet buys it.
- **PnL:** computed locally from a trade log stored in SQLite, using average-cost-basis
  accounting. This is provider-independent and works the same across all chains.
- **Polling:** every wallet is checked on an interval (default every 2 minutes) rather than
  via webhooks, so it works on any host without a public URL.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create a Discord bot**
   - Go to the [Discord Developer Portal](https://discord.com/developers/applications) → New Application
   - Bot tab → Reset Token → copy it → `DISCORD_TOKEN`
   - General Information tab → copy Application ID → `DISCORD_CLIENT_ID`
   - OAuth2 → URL Generator → scopes: `bot`, `applications.commands` → permissions:
     `Send Messages`, `Embed Links` → open the generated URL to invite the bot to your server

3. **Get a Moralis API key**
   - Sign up free at [moralis.com](https://moralis.com) → copy your API key → `MORALIS_API_KEY`

4. **Configure environment**
   ```bash
   cp .env.example .env
   # then fill in DISCORD_TOKEN, DISCORD_CLIENT_ID, MORALIS_API_KEY
   ```

5. **Register slash commands** (run once, and again whenever commands change)
   ```bash
   npm run deploy-commands
   ```

6. **Start the bot**
   ```bash
   npm start
   ```

## Commands

| Command | Description |
|---|---|
| `/track address:<addr> chain:<chain> nickname:<optional>` | Start tracking a wallet. Alerts post in the channel you run this from. |
| `/untrack address:<addr> chain:<chain>` | Stop tracking a wallet. |
| `/wallets` | List all wallets tracked in this server. |
| `/pnl address:<addr> chain:<chain>` | Show realized/unrealized PnL per token for a tracked wallet. |

## Notes & tuning

- `POLL_INTERVAL_MINUTES` in `.env` controls how often wallets are re-checked. Lower = faster
  alerts but more API calls; Moralis free tier has rate limits, so don't set this too aggressively
  if you're tracking a lot of wallets ("batch" mode).
- `NEW_TOKEN_AGE_THRESHOLD_MINUTES` controls what counts as a "fresh ape" (default 24h/1440min).
- The first poll after `/track` silently backfills recent trade history into the PnL database
  without spamming alerts for old trades — only new activity after that triggers a Discord message.
- Storage is a local SQLite file (`tracker.sqlite`) created automatically on first run. Back it up
  if you care about historical PnL data.
- To add more EVM chains (e.g. Avalanche, Optimism), just add an entry to `src/utils/chains.js` —
  Moralis supports most major EVM chains out of the box.

## Limitations to know about

- Moralis' free tier has a request-per-month cap; tracking many wallets on a short poll interval
  will burn through it faster. Consider a paid tier for serious batch tracking.
- PnL uses average-cost-basis on trades this bot has observed since you started tracking each
  wallet — it won't know about a wallet's trading history from *before* you added it.
- New-token/liquidity data depends on DexScreener having indexed the pair yet; extremely fresh
  (seconds-old) pairs may not show up immediately.
