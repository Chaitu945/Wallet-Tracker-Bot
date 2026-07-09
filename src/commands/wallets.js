const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { listWallets } = require("../db");
const { CHAINS } = require("../utils/chains");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("wallets")
    .setDescription("List all wallets currently tracked in this server"),

  async execute(interaction) {
    const wallets = listWallets(interaction.guildId);

    if (!wallets.length) {
      return interaction.reply("No wallets are being tracked yet. Add one with `/track`.");
    }

    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle("📒 Tracked Wallets")
      .setDescription(
        wallets
          .map((w) => `**${CHAINS[w.chain]?.label || w.chain}** — \`${w.address}\`${w.nickname ? ` (${w.nickname})` : ""} — <#${w.channel_id}>`)
          .join("\n")
      );

    await interaction.reply({ embeds: [embed] });
  },
};
