const axios = require("axios");

const EVM_BASE = "https://deep-index.moralis.io/api/v2.2";
const SOLANA_BASE = "https://solana-gateway.moralis.io";

function client() {
  return axios.create({
    headers: {
      "X-API-Key": process.env.MORALIS_API_KEY,
      accept: "application/json",
    },
    timeout: 15000,
  });
}

/**
 * Fetch recent swaps for an EVM wallet on a given chain.
 * Returns a normalized array: { txHash, side, tokenAddress, tokenSymbol, amountToken, amountUsd, priceUsd, blockTs }
 */
async function getEvmSwaps(address, moralisChain, { limit = 20 } = {}) {
  const url = `${EVM_BASE}/wallets/${address}/swaps`;
  const res = await client().get(url, {
    params: { chain: moralisChain, order: "DESC", limit },
  });

  const rows = res.data?.result || [];
  return rows.map((r) => normalizeEvmSwap(r));
}

function normalizeEvmSwap(r) {
  // Moralis swap rows include a transactionType ("buy"/"sell") and bought/sold token legs.
  const side = (r.transactionType || "").toLowerCase() === "sell" ? "sell" : "buy";
  const leg = side === "buy" ? r.bought : r.sold;

  return {
    txHash: r.transactionHash,
    side,
    tokenAddress: leg?.address?.toLowerCase() || null,
    tokenSymbol: leg?.symbol || "UNKNOWN",
    amountToken: leg?.amount ? Number(leg.amount) : null,
    amountUsd: r.totalValueUsd ? Number(r.totalValueUsd) : leg?.usdAmount ? Number(leg.usdAmount) : null,
    priceUsd: leg?.usdPrice ? Number(leg.usdPrice) : null,
    blockTs: r.blockTimestamp ? Math.floor(new Date(r.blockTimestamp).getTime() / 1000) : Math.floor(Date.now() / 1000),
  };
}

/**
 * Fetch recent swaps for a Solana wallet.
 */
async function getSolanaSwaps(address, { limit = 20 } = {}) {
  const url = `${SOLANA_BASE}/account/mainnet/${address}/swaps`;
  const res = await client().get(url, { params: { limit, order: "DESC" } });

  const rows = res.data?.result || res.data || [];
  return rows.map((r) => normalizeSolanaSwap(r));
}

function normalizeSolanaSwap(r) {
  const side = (r.transactionType || "").toLowerCase() === "sell" ? "sell" : "buy";
  const leg = side === "buy" ? r.bought : r.sold;

  return {
    txHash: r.transactionHash || r.signature,
    side,
    tokenAddress: leg?.address || null,
    tokenSymbol: leg?.symbol || "UNKNOWN",
    amountToken: leg?.amount ? Number(leg.amount) : null,
    amountUsd: r.totalValueUsd ? Number(r.totalValueUsd) : leg?.usdAmount ? Number(leg.usdAmount) : null,
    priceUsd: leg?.usdPrice ? Number(leg.usdPrice) : null,
    blockTs: r.blockTimestamp ? Math.floor(new Date(r.blockTimestamp).getTime() / 1000) : Math.floor(Date.now() / 1000),
  };
}

/**
 * Unified entry point used by the poller.
 */
async function getSwaps(address, chainCfg, opts) {
  if (chainCfg.type === "evm") return getEvmSwaps(address, chainCfg.moralisChain, opts);
  if (chainCfg.type === "solana") return getSolanaSwaps(address, opts);
  throw new Error(`Unsupported chain type: ${chainCfg.type}`);
}

module.exports = { getSwaps, getEvmSwaps, getSolanaSwaps };
