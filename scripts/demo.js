#!/usr/bin/env node
/**
 * README screenshot generator.
 *
 * Renders the bot's real alert embeds — the same functions the poller calls at
 * runtime — using fixed fixture data instead of live wallet activity, and posts
 * them to a Discord channel you choose. Nothing is fetched and no Moralis or
 * Alchemy quota is used, so the screenshots cost nothing to produce and can be
 * regenerated whenever the embed layout changes.
 *
 * The data is SAMPLE DATA. The header message says so, and the README captions
 * say so. Do not present these images as live signals.
 *
 * Usage:
 *   DISCORD_TOKEN=... DEMO_CHANNEL_ID=... node scripts/demo.js
 *   node scripts/demo.js --channel 1234567890
 */

require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

const { tradeAlertEmbed, pnlEmbed } = require("../src/utils/embeds");

/**
 * Accepts a bare channel id, a `<#id>` mention, or a full Discord channel URL
 * (`https://discord.com/channels/<guild>/<channel>`) — copying the URL is what
 * people actually do, and the id is always the last path segment.
 */
function extractChannelId(input) {
  const value = String(input || "").trim();
  if (!value) return "";

  const fromUrl = value.match(/channels\/\d+\/(\d+)/);
  if (fromUrl) return fromUrl[1];

  const fromMention = value.match(/^<#(\d+)>$/);
  if (fromMention) return fromMention[1];

  if (/^\d{17,20}$/.test(value)) return value;

  // Looks like a Discord link but without a channel segment (e.g. a guild URL).
  if (/discord\.com/.test(value)) return "";

  return value;
}

function parseChannelId() {
  const flagIndex = process.argv.indexOf("--channel");
  const raw =
    flagIndex !== -1 && process.argv[flagIndex + 1]
      ? process.argv[flagIndex + 1]
      : process.env.DEMO_CHANNEL_ID;
  return extractChannelId(raw);
}

// --- fixture data -----------------------------------------------------------
// Timestamps are relative to now so the embeds don't advertise a stale date.

const now = Math.floor(Date.now() / 1000);

const WATCHED_WALLET = {
  address: "0xAd1539CcDec84e60000b9Bb4baED75B52E9D198D",
  nickname: "Whale #1",
  chain: "robinhood",
};

const ESTABLISHED_BUY = {
  side: "buy",
  tokenSymbol: "PEPEHAT",
  tokenAddress: "0x7f3c1a94b2d8e5a6c0f2b81d4e79a3c5b6d810e2",
  amountToken: 1250000,
  amountUsd: 4200.5,
  priceUsd: 0.0033604,
  txHash: "0x9f2c7b41a8e35d06c1b4f7e29a0d385c6f1b2e74d9a03c58e7f2146b0d9a3c51",
  blockTs: now - 90,
};

const FRESH_APE_BUY = {
  side: "buy",
  tokenSymbol: "NEWFROG",
  tokenAddress: "0x2a91c4e7d0b385f6a2c91e4d7b0f38a5c6e21947d3f80b5a6c19e2d7483bfa05",
  amountToken: 48000000,
  amountUsd: 312.4,
  priceUsd: 0.0000065083,
  txHash: "0x51b8e02d9c4a7f361e8b0d5c2a94f7e13d6b08c5a2e9f4d70b3c816a5e2d9407",
  blockTs: now - 40,
};

const SELL = {
  side: "sell",
  tokenSymbol: "PEPEHAT",
  tokenAddress: "0x7f3c1a94b2d8e5a6c0f2b81d4e79a3c5b6d810e2",
  amountToken: 600000,
  amountUsd: 2810.75,
  priceUsd: 0.00468458,
  txHash: "0x3d70a1f5b8c2e946d0a7c31f5e82b49d6a0c3e71b5f8d29a4c60e3b7d18f5a26",
  blockTs: now - 15,
};

const ESTABLISHED_PAIR = {
  marketCap: 12040000,
  fdv: 13600000,
  liquidityUsd: 842000,
  url: "https://dexscreener.com/robinhood/0x7f3c1a94b2d8e5a6c0f2b81d4e79a3c5b6d810e2",
};

// 22 minutes old — inside the 24h default NEW_TOKEN_AGE_THRESHOLD_MINUTES.
const FRESH_PAIR = {
  marketCap: 41200,
  fdv: 65000,
  liquidityUsd: 9400,
  url: "https://dexscreener.com/robinhood/0x2a91c4e7d0b385f6a2c91e4d7b0f38a5c6e21947d3f80b5a6c19e2d7483bfa05",
};

const SAMPLE_PNL = {
  perToken: [
    {
      tokenAddress: ESTABLISHED_BUY.tokenAddress,
      symbol: "PEPEHAT",
      heldAmount: 650000,
      costBasisUsd: 2184.26,
      realizedPnlUsd: 1275.4,
      unrealizedPnlUsd: 861.32,
      currentValueUsd: 3045.58,
      totalBuysUsd: 4200.5,
      totalSellsUsd: 2810.75,
    },
    {
      tokenAddress: FRESH_APE_BUY.tokenAddress,
      symbol: "NEWFROG",
      heldAmount: 48000000,
      costBasisUsd: 312.4,
      realizedPnlUsd: 0,
      unrealizedPnlUsd: -128.6,
      currentValueUsd: 183.8,
      totalBuysUsd: 312.4,
      totalSellsUsd: 0,
    },
  ],
  totals: { realized: 1275.4, unrealized: 732.72 },
};

// --- main -------------------------------------------------------------------

async function main() {
  const token = (process.env.DISCORD_TOKEN || "").trim();
  const channelId = parseChannelId();

  if (!token) {
    console.error(
      "Missing DISCORD_TOKEN.\n" +
        "\n" +
        "  Create .env in the project root (it is gitignored) with:\n" +
        "\n" +
        "      DISCORD_TOKEN=your_bot_token\n" +
        "\n" +
        "  The bot must be invited to the server, with Send Messages allowed in\n" +
        "  the target channel. See the README Setup section for the invite steps."
    );
    process.exit(1);
  }
  if (!channelId) {
    console.error(
      "Missing or unrecognised channel.\n" +
        "  Pass --channel <id> (a channel URL also works), or set DEMO_CHANNEL_ID.\n" +
        "  Enable Developer Mode in Discord, then right-click the channel and\n" +
        "  choose Copy Channel ID (or Copy Link)."
    );
    process.exit(1);
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once("clientReady", async () => {
    console.log(`[demo] logged in as ${client.user.tag}`);

    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        throw new Error(`channel ${channelId} was not found or is not a text channel`);
      }

      await channel.send(
        "📸 **Demo output** — sample alerts rendered by the bot's real embed code " +
          "(`npm run demo`), using fixture data. No live wallets or APIs were queried."
      );

      const shots = [
        [
          "buy alert",
          tradeAlertEmbed({
            wallet: WATCHED_WALLET,
            trade: ESTABLISHED_BUY,
            isFreshApe: false,
            pairInfo: ESTABLISHED_PAIR,
          }),
        ],
        [
          "fresh-ape alert",
          tradeAlertEmbed({
            wallet: WATCHED_WALLET,
            trade: FRESH_APE_BUY,
            isFreshApe: true,
            pairInfo: FRESH_PAIR,
          }),
        ],
        [
          "sell alert",
          tradeAlertEmbed({
            wallet: WATCHED_WALLET,
            trade: SELL,
            isFreshApe: false,
            pairInfo: ESTABLISHED_PAIR,
          }),
        ],
        ["pnl", pnlEmbed({ wallet: WATCHED_WALLET, pnl: SAMPLE_PNL })],
      ];

      for (const [label, embed] of shots) {
        await channel.send({ embeds: [embed] });
        console.log(`[demo] posted ${label}`);
      }

      console.log("\n[demo] done. Screenshot the embeds and save them into docs/.");
    } catch (err) {
      console.error(`[demo] failed: ${err.message}`);
      if (err.code === 50001)
        console.error("[demo] the bot lacks access to that channel (check its permissions).");
      if (err.code === 10003) console.error("[demo] that channel does not exist.");
      process.exitCode = 1;
    } finally {
      await client.destroy();
    }
  });

  client.on("error", (err) => console.error("[demo] client error:", err.message));

  await client.login(token).catch((err) => {
    console.error(`[demo] login failed: ${err.message}`);
    process.exit(1);
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[demo] unexpected failure: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { extractChannelId };
