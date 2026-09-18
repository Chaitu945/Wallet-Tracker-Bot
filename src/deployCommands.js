require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");
const { applicationIdFromToken } = require("./utils/discordIds");

const commands = [];
const commandsPath = path.join(__dirname, "commands");
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"))) {
  const command = require(path.join(commandsPath, file));
  commands.push(command.data.toJSON());
}

/**
 * The application id is derived from the token instead of being required in .env.
 * The token is authoritative, so asking for the id separately only invites pasting
 * an unrelated snowflake (a channel or guild id from a URL), which fails with a
 * bare 404 "Unknown Application" that says nothing about the actual mistake.
 */
function resolveApplicationId() {
  const token = (process.env.DISCORD_TOKEN || "").trim();
  const fromToken = applicationIdFromToken(token);
  const configured = (process.env.DISCORD_CLIENT_ID || "").trim();

  if (fromToken && configured && configured !== fromToken) {
    console.warn(
      `[deploy] DISCORD_CLIENT_ID (${configured}) does not match the application ` +
        `your token belongs to (${fromToken}).`
    );
    console.warn(
      "[deploy] The token wins — using its application id. Clear DISCORD_CLIENT_ID to silence this."
    );
  }

  const appId = fromToken || configured;
  if (!appId) {
    console.error(
      "[deploy] Could not determine the application id.\n" +
        "  It is read from DISCORD_TOKEN automatically; if that fails, set\n" +
        "  DISCORD_CLIENT_ID to the Application ID (Developer Portal -> General Information)."
    );
    process.exit(1);
  }
  return { appId, derived: Boolean(fromToken) };
}

(async () => {
  const token = (process.env.DISCORD_TOKEN || "").trim();
  if (!token) {
    console.error("[deploy] Missing DISCORD_TOKEN. Run `npm run setup` first.");
    process.exit(1);
  }

  const { appId, derived } = resolveApplicationId();
  console.log(`[deploy] application id: ${appId}${derived ? " (from token)" : " (from DISCORD_CLIENT_ID)"}`);
  console.log(`[deploy] registering ${commands.length} slash commands...`);

  try {
    const rest = new REST().setToken(token);
    const body = await rest.put(Routes.applicationCommands(appId), { body: commands });
    console.log(`[deploy] registered ${body.length} commands: ${body.map((c) => "/" + c.name).join(", ")}`);
    console.log("[deploy] commands may take a minute to appear in Discord.");
  } catch (err) {
    console.error(`[deploy] failed: ${err.message}${err.code ? ` (code ${err.code})` : ""}`);
    if (err.code === 10002) {
      console.error("[deploy] 10002 'Unknown Application' means the id used is not a bot application —");
      console.error("[deploy] usually a channel or guild id pasted where an application id belongs.");
    }
    if (err.code === 50001) console.error("[deploy] 50001 means the bot lacks access to the target.");
    process.exit(1);
  }
})();
