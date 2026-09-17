// Integration test for the storage layer against a real SQLite file in a temp
// directory. `node --test` gives each test file its own process, so setting the
// DB path here keeps the developer's real tracker.sqlite untouched.

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "wallet-tracker-test-"));
process.env.TRACKER_DB_PATH = path.join(TMP_DIR, "test.sqlite");

const {
  addWallet,
  findWallet,
  listWallets,
  removeWallet,
  updateNickname,
  insertTrade,
  getTradesForWallet,
  closeDb,
} = require("../src/db");

test.after(() => {
  // Close first: on Windows an open SQLite handle keeps the file locked and the
  // recursive delete fails with EBUSY.
  closeDb();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

const GUILD = "guild-1";
const CHANNEL = "channel-1";

const EVM_MIXED = "0x6C4C49086faa15b993BEB25c41860eb1f2d51833";
const EVM_LOWER = "0x6c4c49086faa15b993beb25c41860eb1f2d51833";
const SOLANA = "DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK";

test("EVM addresses are stored lowercased and found regardless of input case", () => {
  addWallet({ guildId: GUILD, channelId: CHANNEL, address: EVM_MIXED, chain: "eth" });

  const viaLower = findWallet({ guildId: GUILD, address: EVM_LOWER, chain: "eth" });
  const viaMixed = findWallet({ guildId: GUILD, address: EVM_MIXED, chain: "eth" });

  assert.ok(viaLower, "expected to find the wallet by lowercase");
  assert.ok(viaMixed, "expected to find the wallet by the original mixed case");
  assert.equal(viaLower.address, EVM_LOWER);
  assert.equal(viaLower.id, viaMixed.id, "the two spellings must resolve to one row");
});

test("Solana addresses keep their case and stay reachable", () => {
  // Regression: the address was lowercased on write, so every lookup with the
  // real (case-sensitive) base58 address missed and the wallet never polled.
  addWallet({ guildId: GUILD, channelId: CHANNEL, address: SOLANA, chain: "solana" });

  const found = findWallet({ guildId: GUILD, address: SOLANA, chain: "solana" });
  assert.ok(found, "expected to find the Solana wallet by its exact address");
  assert.equal(found.address, SOLANA, "Solana address must not be lowercased");
  assert.notEqual(found.address, SOLANA.toLowerCase());

  // The lowercased form is a different string and must not match.
  assert.equal(findWallet({ guildId: GUILD, address: SOLANA.toLowerCase(), chain: "solana" }), undefined);
});

test("re-tracking the same wallet updates rather than duplicates", () => {
  addWallet({
    guildId: GUILD,
    channelId: "other-channel",
    address: EVM_LOWER,
    chain: "eth",
    nickname: "Whale",
  });

  const rows = listWallets(GUILD).filter((w) => w.address === EVM_LOWER && w.chain === "eth");
  assert.equal(rows.length, 1, "expected exactly one row for this wallet");
  assert.equal(rows[0].channel_id, "other-channel", "channel should have been updated");
  assert.equal(rows[0].nickname, "Whale");
});

test("the same address on two chains is two independent wallets", () => {
  addWallet({ guildId: GUILD, channelId: CHANNEL, address: EVM_LOWER, chain: "base" });

  const ethWallet = findWallet({ guildId: GUILD, address: EVM_LOWER, chain: "eth" });
  const baseWallet = findWallet({ guildId: GUILD, address: EVM_LOWER, chain: "base" });

  assert.ok(ethWallet && baseWallet);
  assert.notEqual(ethWallet.id, baseWallet.id);
});

test("wallets are isolated per guild", () => {
  addWallet({ guildId: "guild-2", channelId: CHANNEL, address: EVM_LOWER, chain: "eth" });

  const guild1 = findWallet({ guildId: GUILD, address: EVM_LOWER, chain: "eth" });
  const guild2 = findWallet({ guildId: "guild-2", address: EVM_LOWER, chain: "eth" });

  assert.notEqual(guild1.id, guild2.id);
  assert.equal(listWallets("guild-2").length, 1);
});

test("nicknames can be set and cleared", () => {
  addWallet({ guildId: GUILD, channelId: CHANNEL, address: EVM_LOWER, chain: "robinhood" });

  updateNickname({ guildId: GUILD, address: EVM_LOWER, chain: "robinhood", nickname: "Degen" });
  assert.equal(findWallet({ guildId: GUILD, address: EVM_LOWER, chain: "robinhood" }).nickname, "Degen");

  updateNickname({ guildId: GUILD, address: EVM_LOWER, chain: "robinhood", nickname: null });
  assert.equal(findWallet({ guildId: GUILD, address: EVM_LOWER, chain: "robinhood" }).nickname, null);
});

test("duplicate trades are ignored, and trades come back in time order", () => {
  const wallet = findWallet({ guildId: GUILD, address: EVM_LOWER, chain: "eth" });

  insertTrade({
    walletId: wallet.id,
    txHash: "0xaaa",
    tokenAddress: "0xtoken",
    tokenSymbol: "AAA",
    side: "buy",
    amountToken: 10,
    amountUsd: 100,
    priceUsd: 10,
    blockTs: 2000,
  });
  // Same tx/token/side -> must not create a second row.
  insertTrade({
    walletId: wallet.id,
    txHash: "0xaaa",
    tokenAddress: "0xtoken",
    tokenSymbol: "AAA",
    side: "buy",
    amountToken: 10,
    amountUsd: 100,
    priceUsd: 10,
    blockTs: 2000,
  });
  insertTrade({
    walletId: wallet.id,
    txHash: "0xbbb",
    tokenAddress: "0xtoken",
    tokenSymbol: "AAA",
    side: "sell",
    amountToken: 10,
    amountUsd: 150,
    priceUsd: 15,
    blockTs: 1000,
  });

  const trades = getTradesForWallet(wallet.id);
  assert.equal(trades.length, 2, "the duplicate insert should have been ignored");
  assert.deepEqual(
    trades.map((t) => t.block_ts),
    [1000, 2000],
    "trades should be ordered oldest first"
  );
});

test("removing a wallet also removes its trade history", () => {
  const wallet = findWallet({ guildId: GUILD, address: EVM_LOWER, chain: "eth" });
  assert.ok(getTradesForWallet(wallet.id).length > 0);

  removeWallet({ guildId: GUILD, address: EVM_LOWER, chain: "eth" });

  assert.equal(findWallet({ guildId: GUILD, address: EVM_LOWER, chain: "eth" }), undefined);
  assert.equal(getTradesForWallet(wallet.id).length, 0, "orphaned trades should be deleted");
});

test("removing a wallet that was never tracked is a no-op", () => {
  const result = removeWallet({
    guildId: GUILD,
    address: "0x0000000000000000000000000000000000000001",
    chain: "eth",
  });
  assert.equal(result.changes, 0);
});
