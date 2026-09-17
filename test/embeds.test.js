const test = require("node:test");
const assert = require("node:assert/strict");

const { fmtUsd, fmtPrice, shortAddr, tradeAlertEmbed, pnlEmbed } = require("../src/utils/embeds");

test("fmtUsd renders missing values as an em dash rather than NaN", () => {
  assert.equal(fmtUsd(null), "—");
  assert.equal(fmtUsd(undefined), "—");
  assert.equal(fmtUsd(NaN), "—");
});

test("fmtUsd renders zero plainly", () => {
  assert.equal(fmtUsd(0), "$0");
});

test("fmtUsd formats ordinary amounts with separators", () => {
  assert.equal(fmtUsd(1234.5), "$1,234.5");
  assert.equal(fmtUsd(-12.5), "-$12.5");
});

// Locale-independence. Passing `undefined` as the locale makes toLocaleString
// follow the host machine: on an en-IN machine 1250000 renders as "12,50,000"
// (lakh grouping) while an en-US machine renders "1,250,000". Same code, two
// different alerts — and CI never caught it, because the GitHub runner is not
// en-IN. Thousands separators must therefore be asserted at 5+ digits.
test("fmtUsd uses thousands grouping, not the host locale's grouping", () => {
  assert.equal(fmtUsd(1250000), "$1,250,000");
  assert.equal(fmtUsd(12040000), "$12,040,000");
  assert.equal(fmtUsd(12345.67), "$12,345.67");
  assert.equal(fmtUsd(-1250000), "-$1,250,000");
});

test("fmtUsd does not depend on the process ICU locale", () => {
  // Guards the regression directly: whatever the host is set to, the output
  // for the same input must be identical.
  const original = process.env.LANG;
  try {
    process.env.LANG = "en_IN.UTF-8";
    const withIndianLocale = fmtUsd(1250000);
    process.env.LANG = "en_US.UTF-8";
    const withUsLocale = fmtUsd(1250000);
    assert.equal(withIndianLocale, withUsLocale, "fmtUsd output changed with the locale");
    assert.equal(withUsLocale, "$1,250,000");
  } finally {
    if (original === undefined) delete process.env.LANG;
    else process.env.LANG = original;
  }
});

test("fmtPrice uses thousands grouping, not the host locale's grouping", () => {
  assert.equal(fmtPrice(1250000), "$1,250,000");
  assert.equal(fmtPrice(1204000.5), "$1,204,000.5");
});

test("fmtUsd keeps sub-cent values visible instead of rounding them to $0", () => {
  const rendered = fmtUsd(0.0004);
  assert.notEqual(rendered, "$0");
  assert.equal(rendered, "$0.0004");
});

test("fmtUsd keeps the sign on sub-cent values", () => {
  assert.equal(fmtUsd(-0.0004), "-$0.0004");
});

test("fmtPrice never falls back to scientific notation", () => {
  // Memecoin prices land below JS's automatic exponential threshold.
  const rendered = fmtPrice(3.169e-10);
  assert.equal(rendered.includes("e"), false, `got exponential output: ${rendered}`);
  assert.equal(rendered, "$0.0000000003169");
});

test("fmtPrice renders ordinary prices readably", () => {
  assert.equal(fmtPrice(1.5), "$1.5");
  assert.equal(fmtPrice(0), "$0");
  assert.equal(fmtPrice(null), "—");
});

test("shortAddr truncates long addresses but leaves short ones alone", () => {
  const address = "0x6c4c49086faa15b993beb25c41860eb1f2d51833";
  assert.equal(shortAddr(address), "0x6c4c…1833");
  assert.equal(shortAddr("abc"), "abc");
  assert.equal(shortAddr(null), "?");
});

// --- embed shape ------------------------------------------------------------
// Discord rejects an over-limit embed at send time, which would mean a silently
// missing alert rather than a visible error. These assert the real builders stay
// inside the documented limits.

const DISCORD_LIMITS = {
  title: 256,
  description: 4096,
  fieldName: 256,
  fieldValue: 1024,
  fields: 25,
  footer: 2048,
  total: 6000,
};

const WALLET = {
  address: "0xAd1539CcDec84e60000b9Bb4baED75B52E9D198D",
  nickname: "Whale #1",
  chain: "robinhood",
};

const TRADE = {
  side: "buy",
  tokenSymbol: "PEPEHAT",
  tokenAddress: "0x7f3c1a94b2d8e5a6c0f2b81d4e79a3c5b6d810e2",
  amountToken: 1250000,
  amountUsd: 4200.5,
  priceUsd: 0.0033604,
  txHash: "0x9f2c7b41a8e35d06c1b4f7e29a0d385c6f1b2e74d9a03c58e7f2146b0d9a3c51",
  blockTs: 1770000000,
};

const PAIR = {
  marketCap: 12040000,
  fdv: 13600000,
  liquidityUsd: 842000,
  url: "https://dexscreener.com/robinhood/0x7f3c1a94b2d8e5a6c0f2b81d4e79a3c5b6d810e2",
};

function assertWithinDiscordLimits(embed, label) {
  const json = embed.toJSON();
  const length = (v) => (v === undefined || v === null ? 0 : String(v).length);

  assert.ok(length(json.title) <= DISCORD_LIMITS.title, `${label}: title too long`);
  assert.ok(length(json.description) <= DISCORD_LIMITS.description, `${label}: description too long`);
  assert.ok((json.fields || []).length <= DISCORD_LIMITS.fields, `${label}: too many fields`);
  for (const field of json.fields || []) {
    assert.ok(
      length(field.name) <= DISCORD_LIMITS.fieldName,
      `${label}: field name too long (${field.name})`
    );
    assert.ok(
      length(field.value) <= DISCORD_LIMITS.fieldValue,
      `${label}: field value too long (${field.name})`
    );
  }
  assert.ok(length(json.footer?.text) <= DISCORD_LIMITS.footer, `${label}: footer too long`);
  assert.ok(JSON.stringify(json).length <= DISCORD_LIMITS.total, `${label}: embed too large`);

  // An embed URL is used as the click target for the whole embed; a malformed
  // one makes Discord reject the payload.
  if (json.url) assert.doesNotThrow(() => new URL(json.url), `${label}: bad embed url`);
}

test("a trade alert builds a valid embed within Discord's limits", () => {
  const embed = tradeAlertEmbed({ wallet: WALLET, trade: TRADE, isFreshApe: false, pairInfo: PAIR });
  const json = embed.toJSON();

  assert.equal(json.title, "🟢 BUY — PEPEHAT");
  assert.equal(json.url, `https://robinhoodchain.blockscout.com/tx/${TRADE.txHash}`);

  const names = (json.fields || []).map((f) => f.name);
  assert.ok(names.includes("Amount"));
  assert.ok(names.includes("USD Value"));
  assert.ok(names.includes("Price"));
  assert.ok(names.includes("Market Cap"));
  assert.ok(names.includes("📈 Live Chart"));

  assertWithinDiscordLimits(embed, "buy alert");
});

test("a sell alert is colour-coded and labelled as a sell", () => {
  const embed = tradeAlertEmbed({
    wallet: WALLET,
    trade: { ...TRADE, side: "sell" },
    isFreshApe: false,
    pairInfo: PAIR,
  });

  assert.equal(embed.toJSON().title, "🔴 SELL — PEPEHAT");
  assert.equal(embed.toJSON().color, 0xef4444);
  assertWithinDiscordLimits(embed, "sell alert");
});

test("a fresh-ape alert adds the flag and still fits the limits", () => {
  const embed = tradeAlertEmbed({
    wallet: WALLET,
    trade: TRADE,
    isFreshApe: true,
    pairInfo: PAIR,
  });

  assert.ok(
    (embed.toJSON().fields || []).some((f) => f.name.includes("Fresh Ape")),
    "expected a fresh-ape field"
  );
  assertWithinDiscordLimits(embed, "fresh-ape alert");
});

test("an alert degrades gracefully when market data is unavailable", () => {
  // DexScreener is best-effort; a missing pair must not produce a broken embed.
  const embed = tradeAlertEmbed({ wallet: WALLET, trade: TRADE, isFreshApe: false, pairInfo: null });
  const json = embed.toJSON();

  const names = (json.fields || []).map((f) => f.name);
  assert.equal(names.includes("Market Cap"), false);
  assert.equal(names.includes("📈 Live Chart"), false);
  assert.equal(json.url, `https://robinhoodchain.blockscout.com/tx/${TRADE.txHash}`);
  assertWithinDiscordLimits(embed, "no-pair alert");
});

test("an alert with no nickname falls back to a shortened address", () => {
  const embed = tradeAlertEmbed({
    wallet: { ...WALLET, nickname: null },
    trade: TRADE,
    isFreshApe: false,
    pairInfo: PAIR,
  });

  assert.match(embed.toJSON().description, /0xAd15…198D/);
  assertWithinDiscordLimits(embed, "nickname-less alert");
});

test("a PnL embed builds within Discord's limits, including a long token list", () => {
  const perToken = Array.from({ length: 40 }, (_, i) => ({
    tokenAddress: `0x${String(i).padStart(40, "0")}`,
    symbol: `TOKEN${i}`,
    heldAmount: 1000 * (i + 1),
    costBasisUsd: 100 + i,
    realizedPnlUsd: i % 3 === 0 ? -50 - i : 120 + i,
    unrealizedPnlUsd: i % 4 === 0 ? null : 25 + i,
    currentValueUsd: 500 + i,
    totalBuysUsd: 100 + i,
    totalSellsUsd: 40 + i,
  }));

  const embed = pnlEmbed({
    wallet: WALLET,
    pnl: { perToken, totals: { realized: 1234.56, unrealized: 789.01 } },
  });

  assertWithinDiscordLimits(embed, "pnl embed (40 tokens)");
});

test("an empty PnL history says so instead of rendering an empty breakdown", () => {
  const embed = pnlEmbed({
    wallet: WALLET,
    pnl: { perToken: [], totals: { realized: 0, unrealized: 0 } },
  });

  const breakdown = (embed.toJSON().fields || []).find((f) => f.name === "Per-token breakdown");
  assert.ok(breakdown);
  assert.match(breakdown.value, /No trades logged/);
  assertWithinDiscordLimits(embed, "empty pnl embed");
});
