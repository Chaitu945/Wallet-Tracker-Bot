/**
 * Pure average-cost-basis PnL math.
 *
 * Deliberately free of I/O (no DB, no network) so it can be unit-tested directly:
 * the caller supplies the trades and an optional async `getPrice(tokenAddress)`
 * used to mark open positions.
 *
 * Accounting rules:
 *  - Buys add to the position and to the cost basis.
 *  - Sells realize PnL against the average cost of what's held, and reduce both
 *    the position and the cost basis proportionally.
 *  - A sell with no held position (trades from before tracking started) counts
 *    its proceeds with zero cost basis, so sell volume stays truthful instead of
 *    silently disappearing.
 */
async function computePnlFromTrades(trades, { getPrice } = {}) {
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
      } else if (t.side === "sell") {
        if (heldAmount > 0) {
          const avgCost = costBasisUsd / heldAmount;
          const soldAmt = Math.min(amt, heldAmount);
          const costOfSold = avgCost * soldAmt;
          realizedPnlUsd += usd - costOfSold;
          heldAmount -= soldAmt;
          costBasisUsd -= costOfSold;
        } else {
          // Sold tokens we never saw bought — count the proceeds, no cost basis.
          realizedPnlUsd += usd;
        }
        totalSellsUsd += usd;
      }
    }

    // Unrealized PnL on whatever is still held, at the current market price.
    let unrealizedPnlUsd = null;
    let currentValueUsd = null;
    if (heldAmount > 0.000001 && typeof getPrice === "function") {
      const price = await getPrice(tokenAddress);
      if (price) {
        currentValueUsd = heldAmount * price;
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

module.exports = { computePnlFromTrades };
