const { getTradesForWallet } = require("../db");
const { getTokenPairInfo } = require("./dexscreener");
const { computePnlFromTrades } = require("./pnlMath");

/**
 * Computes PnL per token for a wallet from the trade history we logged ourselves
 * (see db.insertTrade). Provider-independent by design — no single vendor's PnL
 * endpoint to depend on or to break.
 *
 * The math itself lives in ./pnlMath (pure, unit-tested); this module only wires
 * it to storage and current prices.
 */
async function computeWalletPnl(walletId) {
  const trades = getTradesForWallet(walletId);
  return computePnlFromTrades(trades, {
    getPrice: async (tokenAddress) => {
      const info = await getTokenPairInfo(tokenAddress);
      return info?.priceUsd ?? null;
    },
  });
}

module.exports = { computeWalletPnl };
