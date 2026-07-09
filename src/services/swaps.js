const moralis = require("./moralis");
const { getRobinhoodSwaps } = require("./robinhoodChain");

/**
 * Single entry point the poller calls, regardless of which chain/provider is behind it.
 */
async function getSwaps(address, chainCfg, opts) {
  if (chainCfg.type === "evm") return moralis.getEvmSwaps(address, chainCfg.moralisChain, opts);
  if (chainCfg.type === "solana") return moralis.getSolanaSwaps(address, opts);
  if (chainCfg.type === "robinhood") return getRobinhoodSwaps(address, opts);
  throw new Error(`Unsupported chain type: ${chainCfg.type}`);
}

module.exports = { getSwaps };
