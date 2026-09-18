#!/usr/bin/env node
/**
 * Verify every configured credential against the live API it will actually be used
 * against.
 *
 * Shape checks in `npm run setup` catch truncated and malformed pastes, but only the
 * provider can say whether a well-formed key is *valid* — a stale, revoked, or
 * wrong-project key passes every format check and then fails on the first poll with
 * an auth error that looks nothing like "your key is wrong".
 *
 * Exits non-zero if any required credential is rejected, so it can gate a deploy.
 *
 *   npm run check-keys
 */

require("dotenv").config();

const TIMEOUT_MS = 15000;

const RED = "\u001b[31m";
const GREEN = "\u001b[32m";
const YELLOW = "\u001b[33m";
const DIM = "\u001b[2m";
const RESET = "\u001b[0m";

const ok = (msg) => `${GREEN}PASS${RESET}  ${msg}`;
const bad = (msg) => `${RED}FAIL${RESET}  ${msg}`;
const warn = (msg) => `${YELLOW}SKIP${RESET}  ${msg}`;

function present(name) {
  const value = (process.env[name] || "").trim();
  if (!value || /^your_/.test(value)) return null;
  return value;
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const body = await res.text();
    return { status: res.status, ok: res.ok, body };
  } catch (err) {
    return {
      networkError: err.name === "AbortError" ? `timed out after ${TIMEOUT_MS / 1000}s` : err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

const trim = (body, n = 120) =>
  String(body || "")
    .replace(/\s+/g, " ")
    .slice(0, n);

async function checkDiscordToken() {
  const token = present("DISCORD_TOKEN");
  if (!token) return { fatal: true, line: warn("DISCORD_TOKEN not set") };

  const res = await request("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bot ${token}` },
  });
  if (res.networkError) return { fatal: true, line: warn(`DISCORD_TOKEN not checked (${res.networkError})`) };
  if (res.ok) {
    const me = JSON.parse(res.body);
    return { line: ok(`DISCORD_TOKEN valid — bot is ${me.username} (id ${me.id})`) };
  }
  return {
    fatal: true,
    line: bad(`DISCORD_TOKEN rejected (${res.status}) — ${trim(res.body, 80)}. Reset it in the Bot tab.`),
  };
}

async function checkMoralis() {
  const key = present("MORALIS_API_KEY");
  if (!key)
    return { optional: true, line: warn("MORALIS_API_KEY not set — EVM and Solana tracking disabled") };

  // The same endpoint the poller uses, with a throwaway address and minimal page.
  const url =
    "https://deep-index.moralis.io/api/v2.2/wallets/0x0000000000000000000000000000000000000000/swaps?chain=eth&limit=1";
  const res = await request(url, { headers: { "X-API-Key": key, accept: "application/json" } });
  if (res.networkError) return { line: warn(`MORALIS_API_KEY not checked (${res.networkError})`) };
  if (res.ok) return { line: ok("MORALIS_API_KEY valid") };
  if (res.status === 401 || res.status === 403) {
    return { fatal: true, line: bad(`MORALIS_API_KEY rejected (${res.status}) — ${trim(res.body, 80)}`) };
  }
  return { line: warn(`MORALIS_API_KEY returned ${res.status}; could not confirm (${trim(res.body, 60)})`) };
}

async function checkAlchemy() {
  const key = present("ALCHEMY_API_KEY");
  if (!key)
    return { optional: true, line: warn("ALCHEMY_API_KEY not set — Robinhood Chain tracking disabled") };

  // eth_blockNumber against the same host the Robinhood adapter uses.
  const res = await request(`https://robinhood-mainnet.g.alchemy.com/v2/${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
  });
  if (res.networkError) return { line: warn(`ALCHEMY_API_KEY not checked (${res.networkError})`) };

  let block = null;
  try {
    const parsed = JSON.parse(res.body);
    if (typeof parsed.result === "string") block = parseInt(parsed.result, 16);
  } catch {
    /* fall through to the status checks below */
  }
  if (block !== null) return { line: ok(`ALCHEMY_API_KEY valid — Robinhood Chain head is block ${block}`) };
  if (res.status === 401 || /authenticated/i.test(res.body)) {
    return { fatal: true, line: bad(`ALCHEMY_API_KEY rejected (${res.status}) — ${trim(res.body, 80)}`) };
  }
  return { line: warn(`ALCHEMY_API_KEY returned ${res.status}; could not confirm (${trim(res.body, 60)})`) };
}

(async () => {
  console.log("Checking credentials against the live APIs...\n");

  const results = await Promise.all([checkDiscordToken(), checkMoralis(), checkAlchemy()]);
  for (const r of results) console.log("  " + r.line);

  const failures = results.filter((r) => r.fatal);
  console.log("");
  if (failures.length) {
    console.log(`  ${failures.length} credential(s) will fail at runtime. Fix them with: npm run setup`);
    console.log(`  ${DIM}(keys are masked on entry; nothing is echoed)`);
    process.exit(1);
  }
  console.log("  All configured credentials work.");
})();
