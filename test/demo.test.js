const test = require("node:test");
const assert = require("node:assert/strict");

const { extractChannelId } = require("../scripts/demo");

// Guild and channel ids from a real server, used as the shape reference.
const GUILD = "838633942503391262";
const CHANNEL = "1550222503484456961";

test("extracts the channel id from a full Discord channel URL", () => {
  // The form people actually paste, copied via "Copy Link".
  assert.equal(extractChannelId(`https://discord.com/channels/${GUILD}/${CHANNEL}`), CHANNEL);
  assert.equal(extractChannelId(`https://discordapp.com/channels/${GUILD}/${CHANNEL}`), CHANNEL);
});

test("ignores trailing content after the channel id in a URL", () => {
  assert.equal(extractChannelId(`https://discord.com/channels/${GUILD}/${CHANNEL}/some-message`), CHANNEL);
});

test("accepts a bare snowflake id", () => {
  assert.equal(extractChannelId(CHANNEL), CHANNEL);
});

test("accepts a channel mention", () => {
  assert.equal(extractChannelId(`<#${CHANNEL}>`), CHANNEL);
});

test("trims surrounding whitespace", () => {
  assert.equal(extractChannelId(`  ${CHANNEL}  `), CHANNEL);
  assert.equal(extractChannelId(`  https://discord.com/channels/${GUILD}/${CHANNEL}  `), CHANNEL);
});

test("rejects a guild URL that carries no channel segment", () => {
  // Must fail loudly rather than being passed to Discord as a bogus channel.
  assert.equal(extractChannelId(`https://discord.com/channels/${GUILD}`), "");
});

test("returns empty for missing input", () => {
  for (const value of ["", "   ", null, undefined]) {
    assert.equal(extractChannelId(value), "");
  }
});

test("passes through non-Discord junk so the fetch fails visibly", () => {
  // Not a Discord link: let the API call produce the error rather than
  // silently treating it as "no channel supplied".
  assert.equal(extractChannelId("not-a-channel"), "not-a-channel");
});
