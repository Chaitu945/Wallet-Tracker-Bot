const path = require("path");
const Database = require("better-sqlite3");
const { normalizeAddress } = require("../utils/validate");

const DB_PATH = process.env.TRACKER_DB_PATH || path.join(__dirname, "..", "..", "tracker.sqlite");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  address TEXT NOT NULL,
  chain TEXT NOT NULL,
  nickname TEXT,
  last_checked_ts INTEGER DEFAULT 0,
  UNIQUE(guild_id, address, chain)
);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_id INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  token_address TEXT,
  token_symbol TEXT,
  side TEXT, -- 'buy' | 'sell'
  amount_token REAL,
  amount_usd REAL,
  price_usd REAL,
  block_ts INTEGER,
  FOREIGN KEY (wallet_id) REFERENCES wallets(id),
  UNIQUE(wallet_id, tx_hash, token_address, side)
);

CREATE INDEX IF NOT EXISTS idx_trades_wallet ON trades(wallet_id);
`);

// Every address that enters or leaves the DB goes through the same per-chain
// normalization. EVM addresses are lowercased (case-insensitive); Solana
// addresses are base58 and case-sensitive, so they must be left alone — an
// earlier version lowercased unconditionally, which corrupted every Solana
// address and made those wallets untrackable.
const norm = (address, chain) => normalizeAddress(address, chain);

// ---- Wallet CRUD ----

function addWallet({ guildId, channelId, address, chain, nickname }) {
  const stmt = db.prepare(`
    INSERT INTO wallets (guild_id, channel_id, address, chain, nickname)
    VALUES (@guildId, @channelId, @address, @chain, @nickname)
    ON CONFLICT(guild_id, address, chain) DO UPDATE SET
      channel_id = excluded.channel_id,
      nickname = excluded.nickname
  `);
  return stmt.run({
    guildId,
    channelId,
    address: norm(address, chain),
    chain,
    nickname: nickname || null,
  });
}

const removeWalletTxn = db.transaction(({ guildId, address, chain }) => {
  const wallet = db
    .prepare(`SELECT id FROM wallets WHERE guild_id = ? AND address = ? AND chain = ?`)
    .get(guildId, norm(address, chain), chain);
  if (!wallet) return { changes: 0 };

  db.prepare(`DELETE FROM trades WHERE wallet_id = ?`).run(wallet.id);
  return db.prepare(`DELETE FROM wallets WHERE id = ?`).run(wallet.id);
});

function removeWallet({ guildId, address, chain }) {
  return removeWalletTxn({ guildId, address, chain });
}

function listWallets(guildId) {
  return db.prepare(`SELECT * FROM wallets WHERE guild_id = ? ORDER BY chain, address`).all(guildId);
}

function getAllWallets() {
  return db.prepare(`SELECT * FROM wallets`).all();
}

function findWallet({ guildId, address, chain }) {
  return db
    .prepare(`SELECT * FROM wallets WHERE guild_id = ? AND address = ? AND chain = ?`)
    .get(guildId, norm(address, chain), chain);
}

function updateLastChecked(walletId, ts) {
  db.prepare(`UPDATE wallets SET last_checked_ts = ? WHERE id = ?`).run(ts, walletId);
}

function updateNickname({ guildId, address, chain, nickname }) {
  const stmt = db.prepare(`
    UPDATE wallets SET nickname = ? WHERE guild_id = ? AND address = ? AND chain = ?
  `);
  return stmt.run(nickname || null, guildId, norm(address, chain), chain);
}

// ---- Trade log (used for PnL) ----

function insertTrade(trade) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO trades
      (wallet_id, tx_hash, token_address, token_symbol, side, amount_token, amount_usd, price_usd, block_ts)
    VALUES
      (@walletId, @txHash, @tokenAddress, @tokenSymbol, @side, @amountToken, @amountUsd, @priceUsd, @blockTs)
  `);
  return stmt.run(trade);
}

function getTradesForWallet(walletId, tokenAddress = null) {
  if (tokenAddress) {
    return db
      .prepare(`SELECT * FROM trades WHERE wallet_id = ? AND token_address = ? ORDER BY block_ts ASC`)
      .all(walletId, tokenAddress);
  }
  return db.prepare(`SELECT * FROM trades WHERE wallet_id = ? ORDER BY block_ts ASC`).all(walletId);
}

/**
 * Release the SQLite handle. Required on Windows, where an open handle keeps the
 * file locked and blocks deletion/moves; also lets a shutdown exit cleanly.
 */
function closeDb() {
  if (db.open) db.close();
}

module.exports = {
  db,
  DB_PATH,
  closeDb,
  addWallet,
  removeWallet,
  listWallets,
  getAllWallets,
  findWallet,
  updateLastChecked,
  updateNickname,
  insertTrade,
  getTradesForWallet,
};
