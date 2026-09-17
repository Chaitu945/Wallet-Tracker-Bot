const test = require("node:test");
const assert = require("node:assert/strict");

const { fmtUsd, fmtPrice, shortAddr } = require("../src/utils/embeds");

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
