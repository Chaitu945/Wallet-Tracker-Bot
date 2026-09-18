const cron = require("node-cron");
const { getAllWallets, updateLastChecked, insertTrade } = require("../db");
const { getSwaps } = require("./swaps");
const { getTokenPairInfo, ageMinutes } = require("./dexscreener");
const { CHAINS } = require("../utils/chains");
const { tradeAlertEmbed } = require("../utils/embeds");
const { pollIntervalToCron } = require("../utils/schedule");

const NEW_TOKEN_THRESHOLD = Number(process.env.NEW_TOKEN_AGE_THRESHOLD_MINUTES || 1440);

// Channel objects are reused across polls instead of being re-fetched for every
// single trade. Cache misses (deleted channel, bot kicked) fall back to a fetch
// and are evicted so a later poll can recover.
const channelCache = new Map();

function startPoller(client) {
  const { expression, minutes, clamped, requested } = pollIntervalToCron(
    process.env.POLL_INTERVAL_MINUTES || 2
  );

  if (clamped) {
    console.warn(
      `[poller] POLL_INTERVAL_MINUTES=${requested} isn't a usable interval; using ${minutes} min instead.`
    );
  }

  console.log(`[poller] starting, checking wallets every ${minutes} min (cron: ${expression})`);

  cron.schedule(expression, () => pollAllWallets(client));

  // Also run once shortly after boot so newly added wallets report quickly.
  setTimeout(() => pollAllWallets(client), 5000);
}

async function pollAllWallets(client) {
  const wallets = getAllWallets();
  for (const wallet of wallets) {
    try {
      await pollWallet(client, wallet);
    } catch (err) {
      console.error(`[poller] error polling wallet ${wallet.address} (${wallet.chain}):`, err.message);
    }
    // Small delay between wallets to be gentle on provider rate limits.
    await sleep(400);
  }
}

async function pollWallet(client, wallet) {
  const chainCfg = CHAINS[wallet.chain];
  if (!chainCfg) return;

  const swaps = await getSwaps(wallet.address, chainCfg, { limit: 15 });
  if (!swaps.length) {
    updateLastChecked(wallet.id, Math.floor(Date.now() / 1000));
    return;
  }

  const isFirstRun = !wallet.last_checked_ts;
  const sinceTs = wallet.last_checked_ts || 0;
  const newSwaps = swaps.filter((s) => s.blockTs > sinceTs).sort((a, b) => a.blockTs - b.blockTs);

  // On the first poll for a freshly-tracked wallet, backfill history for PnL but
  // don't fire a wall of alerts for trades that already happened.
  for (const trade of newSwaps) {
    insertTrade({
      walletId: wallet.id,
      txHash: trade.txHash,
      tokenAddress: trade.tokenAddress,
      tokenSymbol: trade.tokenSymbol,
      side: trade.side,
      amountToken: trade.amountToken,
      amountUsd: trade.amountUsd,
      priceUsd: trade.priceUsd,
      blockTs: trade.blockTs,
    });

    if (isFirstRun) continue;

    let isFreshApe = false;
    let pairInfo = null;
    if (trade.side === "buy" && trade.tokenAddress) {
      pairInfo = await getTokenPairInfo(trade.tokenAddress, CHAINS[wallet.chain]?.dexChain);
      const age = ageMinutes(pairInfo?.pairCreatedAt);
      isFreshApe = age !== null && age <= NEW_TOKEN_THRESHOLD;
    }

    try {
      const channel = await resolveChannel(client, wallet.channel_id);
      if (channel) {
        const embed = tradeAlertEmbed({ wallet, trade, isFreshApe, pairInfo });
        await channel.send({ embeds: [embed] });
      }
    } catch (err) {
      console.error(`[poller] failed to send alert to channel ${wallet.channel_id}:`, err.message);
    }
  }

  // Advance the watermark to the newest trade seen (or now, if nothing new).
  const newestTs = newSwaps.length ? newSwaps[newSwaps.length - 1].blockTs : Math.floor(Date.now() / 1000);
  updateLastChecked(wallet.id, newestTs);
}

async function resolveChannel(client, channelId) {
  if (channelCache.has(channelId)) return channelCache.get(channelId);

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (channel) channelCache.set(channelId, channel);
  return channel;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { startPoller, pollAllWallets, pollWallet };
