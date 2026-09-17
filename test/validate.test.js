const test = require("node:test");
const assert = require("node:assert/strict");

const { isValidAddress, normalizeAddress } = require("../src/utils/validate");

const EVM_LOWER = "0x6c4c49086faa15b993beb25c41860eb1f2d51833";
const EVM_MIXED = "0x6C4C49086faa15b993BEB25c41860eb1f2d51833";
const SOLANA = "DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK";

test("accepts well-formed EVM addresses regardless of case", () => {
  assert.equal(isValidAddress(EVM_LOWER, "eth"), true);
  assert.equal(isValidAddress(EVM_MIXED, "robinhood"), true);
  assert.equal(isValidAddress(EVM_LOWER.toUpperCase().replace("0X", "0x"), "base"), true);
});

test("rejects malformed EVM addresses", () => {
  const bad = [
    "6c4c49086faa15b993beb25c41860eb1f2d51833", // missing 0x
    "0x6c4c49086faa15b993beb25c41860eb1f2d5183", // 39 hex chars
    "0x6c4c49086faa15b993beb25c41860eb1f2d518333", // 41 hex chars
    "0x6c4c49086faa15b993beb25c41860eb1f2d5183z", // non-hex char
    "",
    "   ",
    null,
    undefined,
    42,
  ];
  for (const address of bad) {
    assert.equal(isValidAddress(address, "eth"), false, `should reject ${JSON.stringify(address)}`);
  }
});

test("accepts base58 Solana addresses", () => {
  assert.equal(isValidAddress(SOLANA, "solana"), true);
});

test("rejects Solana addresses containing base58-excluded characters", () => {
  // 0, O, I and l are deliberately absent from base58.
  for (const address of [
    "0Yw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK",
    "OYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK",
    "IYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK",
    "lYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK",
  ]) {
    assert.equal(isValidAddress(address, "solana"), false, `should reject ${address}`);
  }
});

test("rejects an EVM address when the chain is Solana, and vice versa", () => {
  assert.equal(isValidAddress(EVM_LOWER, "solana"), false);
  assert.equal(isValidAddress(SOLANA, "eth"), false);
});

test("unknown chains fall back to EVM validation", () => {
  assert.equal(isValidAddress(EVM_LOWER, "some-new-chain"), true);
  assert.equal(isValidAddress(SOLANA, "some-new-chain"), false);
});

test("normalizes EVM addresses to lowercase", () => {
  assert.equal(normalizeAddress(EVM_MIXED, "eth"), EVM_LOWER);
});

test("preserves Solana address case — base58 is case-sensitive", () => {
  // Regression: lowercasing a Solana address silently points at a different
  // account, which made every tracked Solana wallet unreachable.
  assert.equal(normalizeAddress(SOLANA, "solana"), SOLANA);
  assert.notEqual(normalizeAddress(SOLANA, "solana"), SOLANA.toLowerCase());
});

test("trims surrounding whitespace before normalizing", () => {
  assert.equal(normalizeAddress(`  ${EVM_MIXED}  `, "eth"), EVM_LOWER);
  assert.equal(normalizeAddress(`  ${SOLANA}  `, "solana"), SOLANA);
});

test("normalizeAddress tolerates empty-ish input without throwing", () => {
  assert.equal(normalizeAddress(null, "eth"), "");
  assert.equal(normalizeAddress(undefined, "solana"), "");
});
