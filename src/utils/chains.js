// Central place to add/remove supported chains.
// `type` determines which Moralis API family + base URL is used.
// EVM chains all share the same endpoints, just with a different `chain` query param.

const CHAINS = {
  eth: { label: "Ethereum", type: "evm", moralisChain: "eth", explorer: "https://etherscan.io/tx/" },
  bsc: { label: "BNB Chain", type: "evm", moralisChain: "bsc", explorer: "https://bscscan.com/tx/" },
  polygon: { label: "Polygon", type: "evm", moralisChain: "polygon", explorer: "https://polygonscan.com/tx/" },
  base: { label: "Base", type: "evm", moralisChain: "base", explorer: "https://basescan.org/tx/" },
  arbitrum: { label: "Arbitrum", type: "evm", moralisChain: "arbitrum", explorer: "https://arbiscan.io/tx/" },
  solana: { label: "Solana", type: "solana", moralisChain: "mainnet", explorer: "https://solscan.io/tx/" },
  robinhood: { label: "Robinhood Chain", type: "robinhood", moralisChain: null, explorer: "https://robinhoodchain.blockscout.com/tx/" },
};

function isValidChain(key) {
  return Object.prototype.hasOwnProperty.call(CHAINS, key);
}

function chainChoices() {
  // Used to populate Discord slash command option choices (max 25 allowed by Discord)
  return Object.entries(CHAINS).map(([value, cfg]) => ({ name: cfg.label, value }));
}

module.exports = { CHAINS, isValidChain, chainChoices };
