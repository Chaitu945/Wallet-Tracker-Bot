const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { addWallet } = require("../db");
const { CHAINS, chainChoices } = require("../utils/chains");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("track")
    .setDescription("Start tracking a wallet's buys/sells and PnL")
    .addStringOption((opt) =>
      opt.setName("address").setDescription("Wallet address to track").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("chain").setDescription("Blockchain").setRequired(true).addChoices(...chainChoices())
    )
    .addStringOption((opt) =>
      opt.setName("nickname").setDescription("Optional label, e.g. 'Whale #1'").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const address = interaction.options.getString("address").trim();
    const chain = interaction.options.getString("chain");
    const nickname = interaction.options.getString("nickname");

    if (!CHAINS[chain]) {
      return interaction.reply({ content: "Unsupported chain.", ephemeral: true });
    }

    addWallet({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      address,
      chain,
      nickname,
    });

    await interaction.reply(
      `✅ Now tracking \`${address}\` on **${CHAINS[chain].label}**${nickname ? ` (${nickname})` : ""}.\n` +
      `Alerts for this wallet will post in this channel. First scan may take a minute — the initial trade history is backfilled silently for PnL, then live alerts begin.`
    );
  },
};
