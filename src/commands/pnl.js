const { SlashCommandBuilder } = require("discord.js");
const { findWallet } = require("../db");
const { chainChoices } = require("../utils/chains");
const { computeWalletPnl } = require("../services/pnl");
const { pnlEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("pnl")
    .setDescription("Show profit/loss for a tracked wallet")
    .addStringOption((opt) =>
      opt.setName("address").setDescription("Wallet address").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("chain").setDescription("Blockchain").setRequired(true).addChoices(...chainChoices())
    ),

  async execute(interaction) {
    const address = interaction.options.getString("address").trim();
    const chain = interaction.options.getString("chain");

    const wallet = findWallet({ guildId: interaction.guildId, address, chain });
    if (!wallet) {
      return interaction.reply({
        content: "That wallet isn't tracked in this server yet. Use `/track` first.",
        ephemeral: true,
      });
    }

    await interaction.deferReply();
    const pnl = await computeWalletPnl(wallet.id);
    const embed = pnlEmbed({ wallet, pnl });
    await interaction.editReply({ embeds: [embed] });
  },
};
