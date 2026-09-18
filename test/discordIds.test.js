const test = require("node:test");
const assert = require("node:assert/strict");

const { applicationIdFromToken, isSnowflake } = require("../src/utils/discordIds");

// Build a token-shaped string whose first segment encodes `appId`. Only the shape
// matters here — the real secret segments are irrelevant to id extraction.
const tokenFor = (appId) =>
  `${Buffer.from(appId, "utf8").toString("base64")}.AbCdEf.GhIjKlMnOpQrStUvWxYz0123456789`;

const APP_ID = "1524306050902392962";
const CHANNEL_ID = "1550222503484456961";

test("derives the application id from a well-formed token", () => {
  assert.equal(applicationIdFromToken(tokenFor(APP_ID)), APP_ID);
});

test("returns null for tokens that are not three segments", () => {
  for (const token of ["", "abc", "abc.def", "a.b.c.d", "....", null, undefined]) {
    assert.equal(applicationIdFromToken(token), null, `expected null for ${JSON.stringify(token)}`);
  }
});

test("returns null when the first segment does not decode to a snowflake", () => {
  const notAnId = Buffer.from("hello world", "utf8").toString("base64");
  assert.equal(applicationIdFromToken(`${notAnId}.AbCdEf.GhIjKl`), null);
});

test("trims surrounding whitespace before parsing", () => {
  assert.equal(applicationIdFromToken(`  ${tokenFor(APP_ID)}  `), APP_ID);
});

test("isSnowflake accepts 17-20 digits only", () => {
  assert.equal(isSnowflake("1524306050902392962"), true); // 19
  assert.equal(isSnowflake("12345678901234567"), true); // 17
  assert.equal(isSnowflake("12345678901234567890"), true); // 20
  assert.equal(isSnowflake("1234567890123456"), false); // 16
  assert.equal(isSnowflake("123456789012345678901"), false); // 21
  assert.equal(isSnowflake("152430605090239296a"), false);
  assert.equal(isSnowflake(""), false);
  assert.equal(isSnowflake(null), false);
});

test("a channel id and an application id are indistinguishable by shape", () => {
  // This is precisely why setup cannot reject a wrong id on format alone, and
  // why the application id is cross-checked against the token instead. Both of
  // these are valid snowflakes; only one is the right application.
  assert.equal(isSnowflake(CHANNEL_ID), true);
  assert.equal(isSnowflake(APP_ID), true);
  assert.notEqual(
    applicationIdFromToken(tokenFor(APP_ID)),
    CHANNEL_ID,
    "the token must distinguish them even though the shape cannot"
  );
});
