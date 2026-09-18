const { getTradesForWallet } = require("../db");
const { getTokenPairInfo } = require("./dexscreener");
const { computePnlFromTrades } = require("./pnlMath");
const { CHAINS } = require("../utils/chains");

/**
 * Computes PnL per token for a wallet from the trade history we logged ourselves
 * (see db.insertTrade). Provider-independent by design — no single vendor's PnL
 * endpoint to depend on or to break.
 *
 * The math itself lives in ./pnlMath (pure, unit-tested); this module only wires
 * it to storage and current prices.
 *
 * `chain` is the wallet's chain key: prices must be looked up in that chain's
 * DexScreener namespace, because the same token address exists on other chains
 * and would otherwise return an unrelated market's price.
 */
async function computeWalletPnl(walletId, chain) {
  const dexChain = CHAINS[chain]?.dexChain ?? null;
  const trades = getTradesForWallet(walletId);

  return computePnlFromTrades(trades, {
    getPrice: async (tokenAddress) => {
      const info = await getTokenPairInfo(tokenAddress, dexChain);
      return info?.priceUsd ?? null;
    },
  });
}

module.exports = { computeWalletPnl };
