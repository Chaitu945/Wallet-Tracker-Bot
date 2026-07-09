const axios = require("axios");
const { getTokenPairInfo } = require("./dexscreener");

// Moralis doesn't support Robinhood Chain yet (it's brand new — launched July 2026),
// so we go direct to Blockscout's free, Etherscan-compatible API instead. No key needed.
const BLOCKSCOUT_BASE = process.env.ROBINHOOD_BLOCKSCOUT_API || "https://robinhoodchain.blockscout.com/api";

// Canonical base-pair tokens on Robinhood Chain (from official docs). Almost everything
// trades against one of these, so we use them to figure out swap direction.
const WETH_ADDRESS = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73".toLowerCase();
const USDG_ADDRESS = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168".toLowerCase();
const BASE_TOKENS = new Set([WETH_ADDRESS, USDG_ADDRESS]);

/**
 * Fetch and reconstruct swaps for a wallet on Robinhood Chain.
 * Blockscout only gives us raw ERC-20 transfer events, not decoded "swaps" like Moralis does —
 * so we group transfers by tx hash and infer buy/sell by checking which leg is a base token.
 */
async function getRobinhoodSwaps(address, { limit = 20 } = {}) {
  let transfers;
  try {
    const res = await axios.get(BLOCKSCOUT_BASE, {
      params: { module: "account", action: "tokentx", address, sort: "desc" },
      timeout: 15000,
    });
    transfers = res.data?.result;
  } catch (err) {
    throw new Error(`Blockscout request failed: ${err.message}`);
  }

  if (!Array.isArray(transfers) || transfers.length === 0) return [];

  const addrLower = address.toLowerCase();

  // Group transfer rows by transaction hash — a swap shows up as 2+ transfer events in one tx
  const byTx = new Map();
  for (const t of transfers) {
    if (!byTx.has(t.hash)) byTx.set(t.hash, []);
    byTx.get(t.hash).push(t);
  }

  const rawSwaps = [];

  for (const [hash, rows] of byTx.entries()) {
    const outgoing = rows.filter((r) => r.from?.toLowerCase() === addrLower);
    const incoming = rows.filter((r) => r.to?.toLowerCase() === addrLower);
    if (outgoing.length === 0 || incoming.length === 0) continue; // plain transfer in/out, not a swap

    const outBase = outgoing.find((r) => BASE_TOKENS.has(r.contractAddress?.toLowerCase()));
    const inBase = incoming.find((r) => BASE_TOKENS.has(r.contractAddress?.toLowerCase()));

    let side, tokenLeg;
    if (outBase && !inBase) {
      // spent a base token (WETH/USDG) -> received something else = buy
      side = "buy";
      tokenLeg = incoming.find((r) => r !== inBase) || incoming[0];
    } else if (inBase && !outBase) {
      // received a base token -> gave something else = sell
      side = "sell";
      tokenLeg = outgoing.find((r) => r !== outBase) || outgoing[0];
    } else {
      continue; // token-to-token or ambiguous — skip rather than guess wrong
    }

    if (!tokenLeg?.contractAddress) continue;

    const decimals = Number(tokenLeg.tokenDecimal || 18);
    const amountToken = Number(tokenLeg.value) / Math.pow(10, decimals);

    rawSwaps.push({
      txHash: hash,
      side,
      tokenAddress: tokenLeg.contractAddress.toLowerCase(),
      tokenSymbol: tokenLeg.tokenSymbol || "UNKNOWN",
      amountToken,
      amountUsd: null,
      priceUsd: null,
      blockTs: Number(tokenLeg.timeStamp) || Math.floor(Date.now() / 1000),
    });
  }

  rawSwaps.sort((a, b) => b.blockTs - a.blockTs);
  const trimmed = rawSwaps.slice(0, limit);

  // Enrich with USD pricing via DexScreener (best-effort; uses current price since
  // Blockscout's free tier doesn't give us historical USD value directly)
  for (const s of trimmed) {
    const info = await getTokenPairInfo(s.tokenAddress);
    if (info?.priceUsd) {
      s.priceUsd = info.priceUsd;
      s.amountUsd = s.amountToken * info.priceUsd;
    }
  }

  return trimmed;
}

module.exports = { getRobinhoodSwaps, WETH_ADDRESS, USDG_ADDRESS };
