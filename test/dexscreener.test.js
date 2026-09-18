const test = require("node:test");
const assert = require("node:assert/strict");

const { pickPrimaryPair } = require("../src/services/dexscreener");
const { CHAINS, chainChoices, isValidChain } = require("../src/utils/chains");

const pair = (chainId, liquidityUsd, extra = {}) => ({
  chainId,
  liquidity: { usd: liquidityUsd },
  ...extra,
});

test("every chain declares a DexScreener namespace", () => {
  // Price and market-cap lookups are scoped by this value. A missing one would
  // silently fall back to an unscoped search across all chains.
  for (const [key, cfg] of Object.entries(CHAINS)) {
    assert.ok(cfg.dexChain, `${key} is missing dexChain`);
    assert.equal(typeof cfg.dexChain, "string");
  }
});

test("dexChain values are unique so lookups cannot collide across chains", () => {
  const values = Object.values(CHAINS).map((c) => c.dexChain);
  assert.equal(new Set(values).size, values.length);
});

test("chainChoices fits inside Discord's 25-choice limit", () => {
  assert.ok(chainChoices().length <= 25);
  assert.ok(chainChoices().every((c) => c.name && c.value));
});

test("isValidChain rejects unknown keys", () => {
  assert.equal(isValidChain("eth"), true);
  assert.equal(isValidChain("robinhood"), true);
  assert.equal(isValidChain("doge"), false);
  assert.equal(isValidChain("__proto__"), false);
});

test("pickPrimaryPair selects the highest-liquidity pair on the requested chain", () => {
  const pairs = [pair("ethereum", 100), pair("ethereum", 900), pair("bsc", 5000)];
  assert.equal(pickPrimaryPair(pairs, "ethereum").liquidity.usd, 900);
  assert.equal(pickPrimaryPair(pairs, "bsc").liquidity.usd, 5000);
});

test("pickPrimaryPair never returns another chain's market, even if it is bigger", () => {
  // The real shape that caused a wrong price in production: Ethereum USDC
  // returns 28 PulseChain pairs and 2 Ethereum ones, and the PulseChain pool
  // happened to be the larger of the two.
  const pairs = [pair("pulsechain", 7_703_818), pair("pulsechain", 500), pair("ethereum", 6_971_081)];

  const picked = pickPrimaryPair(pairs, "ethereum");
  assert.equal(picked.chainId, "ethereum");
  assert.equal(picked.liquidity.usd, 6_971_081);
});

test("pickPrimaryPair returns null when the chain has no pairs, rather than guessing", () => {
  const pairs = [pair("pulsechain", 7_703_818)];
  assert.equal(pickPrimaryPair(pairs, "ethereum"), null);
});

test("pickPrimaryPair tolerates empty and malformed input", () => {
  assert.equal(pickPrimaryPair([], "ethereum"), null);
  assert.equal(pickPrimaryPair(null, "ethereum"), null);
  assert.equal(pickPrimaryPair(undefined, "ethereum"), null);
  assert.equal(pickPrimaryPair("nope", "ethereum"), null);
});

test("pickPrimaryPair treats a missing liquidity value as zero", () => {
  const pairs = [{ chainId: "ethereum" }, pair("ethereum", 42)];
  assert.equal(pickPrimaryPair(pairs, "ethereum").liquidity.usd, 42);
});

test("pickPrimaryPair keeps legacy unscoped behaviour when no chain is given", () => {
  // Kept for callers that predate chain scoping; new code should always pass one.
  const pairs = [pair("ethereum", 100), pair("bsc", 5000)];
  assert.equal(pickPrimaryPair(pairs).liquidity.usd, 5000);
});
