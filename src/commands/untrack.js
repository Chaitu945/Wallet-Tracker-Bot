const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { removeWallet, findWallet } = require("../db");
const { CHAINS, chainChoices } = require("../utils/chains");
const { isValidAddress } = require("../utils/validate");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("untrack")
    .setDescription("Stop tracking a wallet")
    .addStringOption((opt) =>
      opt.setName("address").setDescription("Wallet address to stop tracking").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("chain")
        .setDescription("Blockchain")
        .setRequired(true)
        .addChoices(...chainChoices())
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const address = interaction.options.getString("address").trim();
    const chain = interaction.options.getString("chain");

    if (!CHAINS[chain]) {
      return interaction.reply({ content: "Unsupported chain.", ephemeral: true });
    }

    if (!isValidAddress(address, chain)) {
      return interaction.reply({
        content: "That doesn't look like a valid address for that chain.",
        ephemeral: true,
      });
    }

    const existing = findWallet({ guildId: interaction.guildId, address, chain });
    if (!existing) {
      return interaction.reply({
        content: "That wallet isn't being tracked in this server.",
        ephemeral: true,
      });
    }

    removeWallet({ guildId: interaction.guildId, address, chain });
    await interaction.reply(`🗑️ Stopped tracking \`${address}\` on **${CHAINS[chain].label}**.`);
  },
};
