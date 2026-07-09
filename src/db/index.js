const path = require("path");
const Database = require("better-sqlite3");

const db = new Database(path.join(__dirname, "..", "..", "tracker.sqlite"));
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

// ---- Wallet CRUD ----

function addWallet({ guildId, channelId, address, chain, nickname }) {
  const stmt = db.prepare(`
    INSERT INTO wallets (guild_id, channel_id, address, chain, nickname)
    VALUES (@guildId, @channelId, @address, @chain, @nickname)
    ON CONFLICT(guild_id, address, chain) DO UPDATE SET
      channel_id = excluded.channel_id,
      nickname = excluded.nickname
  `);
  return stmt.run({ guildId, channelId, address: address.toLowerCase(), chain, nickname: nickname || null });
}

const removeWalletTxn = db.transaction(({ guildId, address, chain }) => {
  const wallet = db.prepare(`SELECT id FROM wallets WHERE guild_id = ? AND address = ? AND chain = ?`)
    .get(guildId, address.toLowerCase(), chain);
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
  return db.prepare(`SELECT * FROM wallets WHERE guild_id = ? AND address = ? AND chain = ?`)
    .get(guildId, address.toLowerCase(), chain);
}

function updateLastChecked(walletId, ts) {
  db.prepare(`UPDATE wallets SET last_checked_ts = ? WHERE id = ?`).run(ts, walletId);
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
    return db.prepare(`SELECT * FROM trades WHERE wallet_id = ? AND token_address = ? ORDER BY block_ts ASC`)
      .all(walletId, tokenAddress);
  }
  return db.prepare(`SELECT * FROM trades WHERE wallet_id = ? ORDER BY block_ts ASC`).all(walletId);
}

module.exports = {
  db,
  addWallet,
  removeWallet,
  listWallets,
  getAllWallets,
  findWallet,
  updateLastChecked,
  insertTrade,
  getTradesForWallet,
};