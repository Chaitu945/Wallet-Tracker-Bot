const moralis = require("./moralis");
const { getRobinhoodSwaps } = require("./robinhoodChain");

// The chain types this dispatcher knows how to serve. Exported so a chain added
// to utils/chains.js with a typo'd `type` fails a test instead of failing at
// runtime on the first poll.
const SUPPORTED_TYPES = ["evm", "solana", "robinhood"];

/**
 * Single entry point the poller calls, regardless of which chain/provider is
 * behind it.
 */
async function getSwaps(address, chainCfg, opts) {
  if (!chainCfg) throw new Error("getSwaps called without a chain config");

  switch (chainCfg.type) {
    case "evm":
      return moralis.getEvmSwaps(address, chainCfg.moralisChain, opts);
    case "solana":
      return moralis.getSolanaSwaps(address, opts);
    case "robinhood":
      return getRobinhoodSwaps(address, opts);
    default:
      throw new Error(`Unsupported chain type: ${chainCfg.type}`);
  }
}

module.exports = { getSwaps, SUPPORTED_TYPES };
