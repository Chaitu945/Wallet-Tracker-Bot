const test = require("node:test");
const assert = require("node:assert/strict");
const cron = require("node-cron");

const { pollIntervalToCron } = require("../src/utils/schedule");

test("whole minutes under an hour map to */N", () => {
  assert.deepEqual(pollIntervalToCron(2), {
    expression: "*/2 * * * *",
    minutes: 2,
    clamped: false,
    requested: 2,
  });
  assert.equal(pollIntervalToCron(1).expression, "*/1 * * * *");
  assert.equal(pollIntervalToCron(59).expression, "*/59 * * * *");
});

test("fractional minutes are floored", () => {
  const result = pollIntervalToCron(2.9);
  assert.equal(result.minutes, 2);
  assert.equal(result.expression, "*/2 * * * *");
  assert.equal(result.clamped, false);
});

test("whole hours map to an hourly expression", () => {
  assert.deepEqual(pollIntervalToCron(60), {
    expression: "0 */1 * * *",
    minutes: 60,
    clamped: false,
    requested: 60,
  });
  assert.equal(pollIntervalToCron(120).expression, "0 */2 * * *");
});

test("intervals that fit no cron form are clamped, and say so", () => {
  const result = pollIntervalToCron(90);
  assert.equal(result.clamped, true);
  assert.equal(result.minutes, 59);
  assert.equal(result.requested, 90);
});

test("invalid, zero and negative intervals fall back to 1 minute and flag it", () => {
  for (const input of [0, -5, "abc", null, undefined, NaN]) {
    const result = pollIntervalToCron(input);
    assert.equal(result.clamped, true, `expected clamp for ${JSON.stringify(input)}`);
    assert.equal(result.expression, "*/1 * * * *");
  }
});

test("a full day cannot be expressed and is clamped rather than silently dropped", () => {
  const result = pollIntervalToCron(1440);
  assert.equal(result.clamped, true);
  assert.equal(result.minutes, 59);
});

test("every returned expression is one node-cron actually accepts", () => {
  const inputs = [1, 2, 7, 30, 59, 60, 120, 300, 90, 0, -1, 1440, "abc"];
  for (const input of inputs) {
    const { expression } = pollIntervalToCron(input);
    assert.equal(
      cron.validate(expression),
      true,
      `node-cron rejected ${expression} (from ${JSON.stringify(input)})`
    );
  }
});
