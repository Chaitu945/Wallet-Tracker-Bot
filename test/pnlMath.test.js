const test = require("node:test");
const assert = require("node:assert/strict");

const { computePnlFromTrades } = require("../src/services/pnlMath");

const TOKEN_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const trade = (overrides = {}) => ({
  token_address: TOKEN_A,
  token_symbol: "AAA",
  side: "buy",
  amount_token: 0,
  amount_usd: 0,
  ...overrides,
});

test("a full buy/sell round trip realizes the difference", async () => {
  const { perToken, totals } = await computePnlFromTrades([
    trade({ side: "buy", amount_token: 100, amount_usd: 100 }),
    trade({ side: "sell", amount_token: 100, amount_usd: 200 }),
  ]);

  assert.equal(perToken.length, 1);
  assert.equal(perToken[0].realizedPnlUsd, 100);
  assert.equal(perToken[0].heldAmount, 0);
  assert.equal(perToken[0].costBasisUsd, 0);
  assert.equal(totals.realized, 100);
  assert.equal(totals.unrealized, 0);
});

test("a partial sell realizes PnL against average cost and keeps the remainder", async () => {
  const { perToken } = await computePnlFromTrades([
    trade({ side: "buy", amount_token: 100, amount_usd: 100 }), // $1 each
    trade({ side: "sell", amount_token: 50, amount_usd: 80 }), // sold at $1.60
  ]);

  assert.equal(perToken[0].realizedPnlUsd, 30); // 80 - (50 * $1)
  assert.equal(perToken[0].heldAmount, 50);
  assert.equal(perToken[0].costBasisUsd, 50);
});

test("average cost blends multiple buys", async () => {
  const { perToken } = await computePnlFromTrades([
    trade({ side: "buy", amount_token: 100, amount_usd: 100 }), // $1 each
    trade({ side: "buy", amount_token: 100, amount_usd: 300 }), // $3 each
    trade({ side: "sell", amount_token: 100, amount_usd: 400 }), // avg cost $2
  ]);

  assert.equal(perToken[0].realizedPnlUsd, 200); // 400 - (100 * $2)
  assert.equal(perToken[0].heldAmount, 100);
  assert.equal(perToken[0].costBasisUsd, 200);
});

test("unrealized PnL marks the open position to the supplied price", async () => {
  const { perToken, totals } = await computePnlFromTrades(
    [trade({ side: "buy", amount_token: 100, amount_usd: 100 })],
    { getPrice: async () => 3 }
  );

  assert.equal(perToken[0].currentValueUsd, 300);
  assert.equal(perToken[0].unrealizedPnlUsd, 200);
  assert.equal(totals.unrealized, 200);
  assert.equal(totals.realized, 0);
});

test("unrealized PnL is null when no price is available", async () => {
  const { perToken } = await computePnlFromTrades(
    [trade({ side: "buy", amount_token: 100, amount_usd: 100 })],
    { getPrice: async () => null }
  );

  assert.equal(perToken[0].unrealizedPnlUsd, null);
  assert.equal(perToken[0].currentValueUsd, null);
});

test("a sell with no held position counts proceeds but no cost basis", async () => {
  // Happens when the wallet traded before /track was ever run.
  const { perToken, totals } = await computePnlFromTrades([
    trade({ side: "sell", amount_token: 10, amount_usd: 50 }),
  ]);

  assert.equal(perToken[0].realizedPnlUsd, 50);
  assert.equal(perToken[0].totalSellsUsd, 50);
  assert.equal(perToken[0].heldAmount, 0);
  assert.equal(totals.realized, 50);
});

test("selling more than was held never drives the position negative", async () => {
  const { perToken } = await computePnlFromTrades([
    trade({ side: "buy", amount_token: 10, amount_usd: 10 }),
    trade({ side: "sell", amount_token: 50, amount_usd: 50 }),
  ]);

  assert.equal(perToken[0].heldAmount, 0);
  assert.equal(perToken[0].costBasisUsd, 0);
  assert.equal(perToken[0].realizedPnlUsd, 40); // capped at the 10 actually held
});

test("tokens are tracked independently", async () => {
  const { perToken, totals } = await computePnlFromTrades([
    trade({ token_address: TOKEN_A, token_symbol: "AAA", side: "buy", amount_token: 10, amount_usd: 10 }),
    trade({ token_address: TOKEN_A, token_symbol: "AAA", side: "sell", amount_token: 10, amount_usd: 25 }),
    trade({ token_address: TOKEN_B, token_symbol: "BBB", side: "buy", amount_token: 5, amount_usd: 50 }),
    trade({ token_address: TOKEN_B, token_symbol: "BBB", side: "sell", amount_token: 5, amount_usd: 20 }),
  ]);

  assert.equal(perToken.length, 2);
  assert.equal(totals.realized, 15 + -30);
});

test("trades without a token address are ignored", async () => {
  const { perToken } = await computePnlFromTrades([
    trade({ token_address: null, side: "buy", amount_token: 1, amount_usd: 1 }),
  ]);

  assert.equal(perToken.length, 0);
});

test("an empty trade list produces zeroed totals", async () => {
  const { perToken, totals } = await computePnlFromTrades([]);

  assert.equal(perToken.length, 0);
  assert.deepEqual(totals, { realized: 0, unrealized: 0 });
});
