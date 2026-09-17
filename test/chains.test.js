const test = require("node:test");
const assert = require("node:assert/strict");

const { CHAINS, isValidChain, chainChoices } = require("../src/utils/chains");
const { SUPPORTED_TYPES } = require("../src/services/swaps");

// Discord rejects a slash command with more than 25 choices, and a choice name
// longer than 100 characters. Exceeding either makes `/track` unregisterable.
const DISCORD_MAX_CHOICES = 25;
const DISCORD_MAX_CHOICE_NAME = 100;

test("every chain declares the fields the rest of the bot relies on", () => {
  for (const [key, cfg] of Object.entries(CHAINS)) {
    assert.ok(cfg.label, `${key} is missing a label`);
    assert.ok(cfg.type, `${key} is missing a type`);
    assert.ok(cfg.explorer, `${key} is missing an explorer`);
    assert.match(cfg.explorer, /^https:\/\//, `${key} explorer should be an https URL`);
  }
});

test("every chain type is handled by the swap dispatcher", () => {
  for (const [key, cfg] of Object.entries(CHAINS)) {
    assert.ok(
      SUPPORTED_TYPES.includes(cfg.type),
      `chain "${key}" declares type "${cfg.type}", which swaps.js cannot serve`
    );
  }
});

test("EVM chains point at a Moralis chain id; Solana uses mainnet", () => {
  for (const [key, cfg] of Object.entries(CHAINS)) {
    if (cfg.type === "evm") {
      assert.ok(cfg.moralisChain, `${key} is an EVM chain but has no moralisChain`);
    }
    if (cfg.type === "solana") {
      assert.equal(cfg.moralisChain, "mainnet");
    }
  }
});

test("Robinhood Chain has its own adapter and needs no Moralis chain id", () => {
  assert.equal(CHAINS.robinhood.type, "robinhood");
  assert.equal(CHAINS.robinhood.moralisChain, null);
});

test("slash-command choices stay within Discord's limits", () => {
  const choices = chainChoices();
  assert.ok(
    choices.length <= DISCORD_MAX_CHOICES,
    `${choices.length} chains exceeds Discord's limit of ${DISCORD_MAX_CHOICES} choices`
  );

  for (const choice of choices) {
    assert.ok(choice.value, "a choice is missing its value");
    assert.ok(choice.name.length <= DISCORD_MAX_CHOICE_NAME, `choice name too long: ${choice.name}`);
  }
});

test("choice values are the chain keys, so they round-trip into CHAINS", () => {
  for (const choice of chainChoices()) {
    assert.ok(isValidChain(choice.value), `${choice.value} is not a known chain`);
  }
});

test("isValidChain rejects unknown keys", () => {
  assert.equal(isValidChain("eth"), true);
  assert.equal(isValidChain("robinhood"), true);
  assert.equal(isValidChain("dogecoin"), false);
  assert.equal(isValidChain(""), false);
});
