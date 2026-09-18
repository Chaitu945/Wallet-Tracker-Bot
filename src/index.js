require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, Collection } = require("discord.js");
const { closeDb } = require("./db");
const { startPoller } = require("./services/poller");

// Fail fast with a readable message rather than an opaque discord.js throw.
// DISCORD_CLIENT_ID is deliberately not required: the application id is derived
// from the token, so requiring a second copy of it only adds a way to get it wrong.
if (!(process.env.DISCORD_TOKEN || "").trim()) {
  console.error("[bot] Missing DISCORD_TOKEN. Run `npm run setup` to fill in .env interactively.");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

const commandsPath = path.join(__dirname, "commands");
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

// `ready` was renamed to `clientReady` in discord.js (hard-renamed in v15);
// listening on the old name logs a deprecation warning on every startup.
client.once("clientReady", () => {
  console.log(`[bot] Logged in as ${client.user.tag}`);
  console.log(`[bot] Loaded ${client.commands.size} commands across ${client.guilds.cache.size} guild(s)`);
  startPoller(client);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`[bot] error running /${interaction.commandName}:`, err);
    const payload = { content: "Something went wrong running that command.", ephemeral: true };
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    } catch (replyErr) {
      // The interaction token can expire while the command is still running.
      console.error(`[bot] could not report command failure:`, replyErr.message);
    }
  }
});

// Without this, a dropped connection (network blip, Discord-side restart) takes
// the process down silently.
client.on("error", (err) => console.error("[bot] client error:", err.message));

process.on("unhandledRejection", (err) => {
  console.error("[bot] unhandled rejection:", err);
});

async function shutdown(signal) {
  console.log(`[bot] ${signal} received, shutting down...`);
  await client.destroy().catch(() => {});
  closeDb();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error(`[bot] login failed: ${err.message}`);
  console.error("[bot] Check that DISCORD_TOKEN is a valid, unexpired bot token.");
  process.exit(1);
});
