// Central place to add/remove supported chains.
// `type` determines which provider adapter is used (see services/swaps.js).
// `dexChain` is DexScreener's chain identifier — required for any price or
// market-cap lookup, because an address is NOT unique across chains and an
// unscoped lookup can return another network's market.

const CHAINS = {
  eth: {
    label: "Ethereum",
    type: "evm",
    moralisChain: "eth",
    dexChain: "ethereum",
    explorer: "https://etherscan.io/tx/",
  },
  bsc: {
    label: "BNB Chain",
    type: "evm",
    moralisChain: "bsc",
    dexChain: "bsc",
    explorer: "https://bscscan.com/tx/",
  },
  polygon: {
    label: "Polygon",
    type: "evm",
    moralisChain: "polygon",
    dexChain: "polygon",
    explorer: "https://polygonscan.com/tx/",
  },
  base: {
    label: "Base",
    type: "evm",
    moralisChain: "base",
    dexChain: "base",
    explorer: "https://basescan.org/tx/",
  },
  arbitrum: {
    label: "Arbitrum",
    type: "evm",
    moralisChain: "arbitrum",
    dexChain: "arbitrum",
    explorer: "https://arbiscan.io/tx/",
  },
  solana: {
    label: "Solana",
    type: "solana",
    moralisChain: "mainnet",
    dexChain: "solana",
    explorer: "https://solscan.io/tx/",
  },
  robinhood: {
    label: "Robinhood Chain",
    type: "robinhood",
    moralisChain: null,
    dexChain: "robinhood",
    explorer: "https://robinhoodchain.blockscout.com/tx/",
  },
  ink: {
    label: "Ink Chain",
    type: "evm",
    moralisChain: "ink",
    dexChain: "ink",
    explorer: "https://explorer.inkonchain.com/tx/",
  },
};

function isValidChain(key) {
  return Object.prototype.hasOwnProperty.call(CHAINS, key);
}

function chainChoices() {
  // Used to populate Discord slash command option choices (max 25 allowed by Discord)
  return Object.entries(CHAINS).map(([value, cfg]) => ({ name: cfg.label, value }));
}

module.exports = { CHAINS, isValidChain, chainChoices };
