const { getTradesForWallet } = require("../db");
const { getTokenPairInfo } = require("./dexscreener");

/**
 * Computes PnL per token for a wallet using average-cost-basis accounting
 * against the trade history we've logged ourselves (see db.insertTrade).
 * This avoids depending on any single provider's PnL endpoint/shape.
 */
async function computeWalletPnl(walletId) {
  const trades = getTradesForWallet(walletId);

  // group by token
  const byToken = new Map();
  for (const t of trades) {
    if (!t.token_address) continue;
    if (!byToken.has(t.token_address)) byToken.set(t.token_address, []);
    byToken.get(t.token_address).push(t);
  }

  const results = [];

  for (const [tokenAddress, tokenTrades] of byToken.entries()) {
    let heldAmount = 0;
    let costBasisUsd = 0; // total USD spent on currently-held tokens
    let realizedPnlUsd = 0;
    let totalBuysUsd = 0;
    let totalSellsUsd = 0;
    const symbol = tokenTrades[0].token_symbol;

    for (const t of tokenTrades) {
      const amt = t.amount_token || 0;
      const usd = t.amount_usd || 0;

      if (t.side === "buy") {
        heldAmount += amt;
        costBasisUsd += usd;
        totalBuysUsd += usd;
      } else if (t.side === "sell" && heldAmount > 0) {
        const avgCost = costBasisUsd / heldAmount;
        const soldAmt = Math.min(amt, heldAmount);
        const costOfSold = avgCost * soldAmt;
        realizedPnlUsd += usd - costOfSold;
        heldAmount -= soldAmt;
        costBasisUsd -= costOfSold;
        totalSellsUsd += usd;
      }
    }

    // unrealized PnL on whatever is still held, using current price from DexScreener
    let unrealizedPnlUsd = null;
    let currentValueUsd = null;
    if (heldAmount > 0.000001) {
      const info = await getTokenPairInfo(tokenAddress);
      if (info?.priceUsd) {
        currentValueUsd = heldAmount * info.priceUsd;
        unrealizedPnlUsd = currentValueUsd - costBasisUsd;
      }
    }

    results.push({
      tokenAddress,
      symbol,
      heldAmount,
      costBasisUsd,
      realizedPnlUsd,
      unrealizedPnlUsd,
      currentValueUsd,
      totalBuysUsd,
      totalSellsUsd,
    });
  }

  const totals = results.reduce(
    (acc, r) => {
      acc.realized += r.realizedPnlUsd || 0;
      acc.unrealized += r.unrealizedPnlUsd || 0;
      return acc;
    },
    { realized: 0, unrealized: 0 }
  );

  return { perToken: results, totals };
}

module.exports = { computeWalletPnl };
