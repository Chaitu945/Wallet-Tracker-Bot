const cron = require("node-cron");
const { getAllWallets, updateLastChecked, insertTrade } = require("../db");
const { getSwaps } = require("./swaps");
const { getTokenPairInfo, ageMinutes } = require("./dexscreener");
const { CHAINS } = require("../utils/chains");
const { tradeAlertEmbed } = require("../utils/embeds");

const NEW_TOKEN_THRESHOLD = Number(process.env.NEW_TOKEN_AGE_THRESHOLD_MINUTES || 1440);

function startPoller(client) {
  const intervalMin = Number(process.env.POLL_INTERVAL_MINUTES || 2);
  const cronExpr = `*/${Math.max(1, intervalMin)} * * * *`;

  console.log(`[poller] starting, checking wallets every ${intervalMin} min`);

  cron.schedule(cronExpr, () => pollAllWallets(client));

  // also run once shortly after boot
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
    // small delay between wallets to be gentle on API rate limits
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

  // On the very first poll for a freshly-tracked wallet, backfill trade history for
  // PnL purposes but don't fire alerts for a wall of old trades.
  for (const trade of newSwaps) {
    // log for PnL, regardless of whether we alert
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

    if (isFirstRun) continue; // logged for PnL, but skip alerting on historical backfill

    let isFreshApe = false;
    let pairInfo = null;
    if (trade.side === "buy" && trade.tokenAddress) {
      pairInfo = await getTokenPairInfo(trade.tokenAddress);
      const age = ageMinutes(pairInfo?.pairCreatedAt);
      isFreshApe = age !== null && age <= NEW_TOKEN_THRESHOLD;
    }

    try {
      const channel = await client.channels.fetch(wallet.channel_id);
      if (channel) {
        const embed = tradeAlertEmbed({ wallet, trade, isFreshApe, pairInfo });
        await channel.send({ embeds: [embed] });
      }
    } catch (err) {
      console.error(`[poller] failed to send alert to channel ${wallet.channel_id}:`, err.message);
    }
  }

  // update watermark to the newest trade we've seen (or now, if none new)
  const newestTs = newSwaps.length ? newSwaps[newSwaps.length - 1].blockTs : Math.floor(Date.now() / 1000);
  updateLastChecked(wallet.id, newestTs);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { startPoller, pollAllWallets, pollWallet };
