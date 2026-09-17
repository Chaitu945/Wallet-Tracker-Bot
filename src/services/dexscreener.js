const axios = require("axios");

const DEXSCREENER = "https://api.dexscreener.com/latest/dex";

/**
 * Look up market data for a token so we can flag when a tracked wallet apes into
 * a very new pool.
 *
 * Uses the `/tokens/{address}` endpoint rather than `/search?q=`, which is a fuzzy
 * text search: it happily returns unrelated tokens whose name happens to contain
 * the address, burns a bigger response, and needs post-filtering to be correct.
 * The token endpoint is an exact lookup, so every returned pair actually contains
 * this token.
 */
async function getTokenPairInfo(tokenAddress) {
  if (!tokenAddress) return null;

  try {
    const res = await axios.get(`${DEXSCREENER}/tokens/${tokenAddress}`, { timeout: 10000 });
    const pairs = res.data?.pairs;
    if (!Array.isArray(pairs) || pairs.length === 0) return null;

    // Belt-and-braces: only keep pairs that really reference this token, then pick
    // the deepest pool as the canonical one (a token can have many pairs).
    const addrLower = String(tokenAddress).toLowerCase();
    const matching = pairs.filter(
      (p) =>
        p.baseToken?.address?.toLowerCase() === addrLower ||
        p.quoteToken?.address?.toLowerCase() === addrLower
    );
    if (matching.length === 0) return null;

    const primary = matching.reduce(
      (best, p) => ((p.liquidity?.usd || 0) > (best.liquidity?.usd || 0) ? p : best),
      matching[0]
    );

    return {
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

module.exports = { getTokenPairInfo, ageMinutes };
