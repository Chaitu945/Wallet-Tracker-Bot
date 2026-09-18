/**
 * Discord id helpers.
 *
 * A bot token's first dot-separated segment is the base64url-encoded application
 * id, and for a bot the user id IS the application id. That makes the token
 * authoritative for the application id, so nothing has to be copied by hand —
 * and copying is exactly how a channel or guild id ends up in DISCORD_CLIENT_ID,
 * which Discord rejects with a bare 404 "Unknown Application".
 */

const SNOWFLAKE_RE = /^\d{17,20}$/;

/** True for a plausible Discord snowflake (channel, guild, user or application id). */
function isSnowflake(value) {
  return SNOWFLAKE_RE.test(String(value || "").trim());
}

/**
 * Decode the application id out of a bot token, or null if the token is absent
 * or does not have the expected three-segment shape.
 */
function applicationIdFromToken(token) {
  const segments = String(token || "")
    .trim()
    .split(".");
  if (segments.length !== 3 || !segments[0]) return null;

  try {
    const decoded = Buffer.from(segments[0], "base64").toString("utf8");
    return isSnowflake(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

module.exports = { applicationIdFromToken, isSnowflake };
