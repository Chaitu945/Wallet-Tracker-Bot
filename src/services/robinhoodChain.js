const axios = require("axios");
const { getTokenPairInfo } = require("./dexscreener");

// Robinhood Chain support went live on Alchemy shortly after launch. Uses the same
// ALCHEMY_API_KEY you may already have from other projects — Alchemy keys work across
// all chains by default (check the Networks tab on your key if unsure).
const ALCHEMY_BASE = "https://robinhood-mainnet.g.alchemy.com/v2";

// Canonical base-pair tokens on Robinhood Chain (from official docs). Almost everything
// trades against one of these, so we use them to figure out swap direction.
const WETH_ADDRESS = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73".toLowerCase();
const USDG_ADDRESS = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168".toLowerCase();
const BASE_TOKENS = new Set([WETH_ADDRESS, USDG_ADDRESS]);

async function callAlchemy(apiKey, params) {
  const res = await axios.post(
    `${ALCHEMY_BASE}/${apiKey}`,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "alchemy_getAssetTransfers",
      params: [params],
    },
    { timeout: 15000 }
  );
  if (res.data?.error) {
    throw new Error(`Alchemy error: ${res.data.error.message || JSON.stringify(res.data.error)}`);
  }
  return res.data?.result?.transfers || [];
}

/**
 * Fetch and reconstruct swaps for a wallet on Robinhood Chain using Alchemy's Transfers API.
 * Like the Blockscout approach, this gives us raw ERC-20 transfers, not decoded "swaps" —
 * so we fetch both directions, group by tx hash, and infer buy/sell via base-token legs.
 */
async function getRobinhoodSwaps(address, { limit = 20 } = {}) {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ALCHEMY_API_KEY is not set. Add your Alchemy API key to .env (the same one works across chains)."
    );
  }

  const maxCountHex = "0x" + Math.min(limit * 4, 100).toString(16); // grab extra since each swap = 2+ transfer rows

  let outgoing, incoming;
  try {
    [outgoing, incoming] = await Promise.all([
      callAlchemy(apiKey, {
        fromAddress: address,
        category: ["erc20"],
        order: "desc",
        maxCount: maxCountHex,
        withMetadata: true,
      }),
      callAlchemy(apiKey, {
        toAddress: address,
        category: ["erc20"],
        order: "desc",
        maxCount: maxCountHex,
        withMetadata: true,
      }),
    ]);
  } catch (err) {
    const status = err.response?.status;
    throw new Error(`Alchemy request failed${status ? ` (${status})` : ""}: ${err.message}`);
  }

  const allTransfers = [...outgoing, ...incoming];
  if (allTransfers.length === 0) return [];

  const addrLower = address.toLowerCase();

  // Group by tx hash — a swap shows up as 2+ transfer events in one tx
  const byTx = new Map();
  for (const t of allTransfers) {
    if (!byTx.has(t.hash)) byTx.set(t.hash, []);
    byTx.get(t.hash).push(t);
  }

  const rawSwaps = [];

  for (const [hash, rows] of byTx.entries()) {
    const out = rows.filter((r) => r.from?.toLowerCase() === addrLower);
    const inn = rows.filter((r) => r.to?.toLowerCase() === addrLower);
    if (out.length === 0 || inn.length === 0) continue; // plain transfer in/out, not a swap

    const outBase = out.find((r) => BASE_TOKENS.has(r.rawContract?.address?.toLowerCase()));
    const inBase = inn.find((r) => BASE_TOKENS.has(r.rawContract?.address?.toLowerCase()));

    let side, tokenLeg;
    if (outBase && !inBase) {
      side = "buy"; // spent a base token (WETH/USDG) -> received something else
      tokenLeg = inn.find((r) => r !== inBase) || inn[0];
    } else if (inBase && !outBase) {
      side = "sell"; // received a base token -> gave something else
      tokenLeg = out.find((r) => r !== outBase) || out[0];
    } else {
      continue; // token-to-token or ambiguous — skip rather than guess wrong
    }

    if (!tokenLeg?.rawContract?.address) continue;

    const blockTs = tokenLeg.metadata?.blockTimestamp
      ? Math.floor(new Date(tokenLeg.metadata.blockTimestamp).getTime() / 1000)
      : Math.floor(Date.now() / 1000);

    rawSwaps.push({
      txHash: hash,
      side,
      tokenAddress: tokenLeg.rawContract.address.toLowerCase(),
      tokenSymbol: tokenLeg.asset || "UNKNOWN",
      amountToken: Number(tokenLeg.value) || 0, // Alchemy already returns human-readable decimal value
      amountUsd: null,
      priceUsd: null,
      blockTs,
    });
  }

  rawSwaps.sort((a, b) => b.blockTs - a.blockTs);
  const trimmed = rawSwaps.slice(0, limit);

  // Enrich with USD pricing via DexScreener (best-effort; uses current price)
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
