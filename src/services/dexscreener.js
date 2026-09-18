const axios = require("axios");

const DEXSCREENER = "https://api.dexscreener.com/latest/dex";

/**
 * Choose the canonical pair for a token from DexScreener's response.
 *
 * Pure and separately testable because it is where the subtle bug lives: a token
 * address is not unique across chains. `/tokens/{address}` returns every pair on
 * every chain sharing that address — Ethereum USDC comes back as 28 PulseChain
 * pairs and 2 Ethereum ones — so picking "highest liquidity" across all of them
 * can silently select another network's market. That yields a wrong price, a
 * wrong market cap, and a wrong "fresh ape" pool age.
 *
 * `chainId` is therefore a filter, not a hint: no matching chain means no data,
 * which the caller treats as "unknown" rather than substituting a wrong number.
 */
function pickPrimaryPair(pairs, chainId) {
  if (!Array.isArray(pairs) || pairs.length === 0) return null;

  const candidates = chainId ? pairs.filter((p) => p.chainId === chainId) : pairs;
  if (candidates.length === 0) return null;

  return candidates.reduce(
    (best, p) => ((p.liquidity?.usd || 0) > (best.liquidity?.usd || 0) ? p : best),
    candidates[0]
  );
}

/**
 * Look up market data for a token so we can flag when a tracked wallet apes into
 * a very new pool.
 *
 * `chainId` is the DexScreener chain identifier (see utils/chains.js `dexChain`).
 * Omitting it falls back to the old unscoped behaviour and should be avoided.
 */
async function getTokenPairInfo(tokenAddress, chainId) {
  if (!tokenAddress) return null;

  try {
    const res = await axios.get(`${DEXSCREENER}/tokens/${tokenAddress}`, { timeout: 10000 });
    const primary = pickPrimaryPair(res.data?.pairs, chainId);
    if (!primary) return null;

    return {
      chainId: primary.chainId,
      pairCreatedAt: primary.pairCreatedAt || null, // ms epoch
      priceUsd: primary.priceUsd ? Number(primary.priceUsd) : null,
      liquidityUsd: primary.liquidity?.usd || null,
      marketCap: primary.marketCap || null,
      fdv: primary.fdv || null,
      url: primary.url,
      dexId: primary.dexId,
    };
  } catch {
    // Fail soft — the new-token flag is a bonus signal and must never block
    // or crash core tracking.
    return null;
  }
}

function ageMinutes(pairCreatedAtMs) {
  if (!pairCreatedAtMs) return null;
  return Math.floor((Date.now() - pairCreatedAtMs) / 60000);
}

module.exports = { getTokenPairInfo, ageMinutes, pickPrimaryPair };
