// Address validation + normalization, shared by the slash commands and the DB layer.
// Deliberately dependency-free so the bot can validate input without a web3 library.

// EVM chains (Ethereum, BNB, Polygon, Base, Arbitrum, Robinhood): 0x + 40 hex chars.
const EVM_RE = /^0x[0-9a-fA-F]{40}$/;

// Solana uses base58, which excludes 0, O, I and l. Addresses are 32-44 chars.
const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * True when `address` is well-formed for the given chain key.
 * Unknown chains are treated as EVM, which is the safe default.
 */
function isValidAddress(address, chain) {
  if (typeof address !== "string") return false;
  const trimmed = address.trim();
  if (!trimmed) return false;
  if (chain === "solana") return SOLANA_RE.test(trimmed);
  return EVM_RE.test(trimmed);
}

/**
 * Canonical form used as the storage/lookup key.
 *
 * EVM addresses are case-insensitive, so they're lowercased. Solana addresses are
 * base58 and therefore CASE-SENSITIVE — lowercasing one silently points at a
 * different (usually non-existent) account, so they're returned untouched.
 */
function normalizeAddress(address, chain) {
  const trimmed = String(address || "").trim();
  return chain === "solana" ? trimmed : trimmed.toLowerCase();
}

module.exports = { isValidAddress, normalizeAddress, EVM_RE, SOLANA_RE };
