const axios = require("axios");

// DexScreener requires no API key. We use it purely to check pair age / current price
// so we can flag when a tracked wallet apes into a very new token.
async function getTokenPairInfo(tokenAddress) {
  if (!tokenAddress) return null;
  try {
    const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, {
      timeout: 10000,
    });
    const pairs = res.data?.pairs;
    if (!pairs || pairs.length === 0) return null;

    // Pick the pair with the highest liquidity as the "primary" one
    const primary = pairs.reduce((best, p) =>
      (p.liquidity?.usd || 0) > (best.liquidity?.usd || 0) ? p : best, pairs[0]);

    return {
      pairCreatedAt: primary.pairCreatedAt || null, // ms epoch
      priceUsd: primary.priceUsd ? Number(primary.priceUsd) : null,
      liquidityUsd: primary.liquidity?.usd || null,
      url: primary.url,
      dexId: primary.dexId,
    };
  } catch (err) {
    return null; // fail soft — new-token flag is a bonus feature, never block core tracking on it
  }
}

function ageMinutes(pairCreatedAtMs) {
  if (!pairCreatedAtMs) return null;
  return Math.floor((Date.now() - pairCreatedAtMs) / 60000);
}

module.exports = { getTokenPairInfo, ageMinutes };
