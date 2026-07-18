const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { findWallet, updateNickname } = require("../db");
const { CHAINS, chainChoices } = require("../utils/chains");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rename")
    .setDescription("Change the nickname of an already-tracked wallet")
    .addStringOption((opt) =>
      opt.setName("address").setDescription("Wallet address").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("chain").setDescription("Blockchain").setRequired(true).addChoices(...chainChoices())
    )
    .addStringOption((opt) =>
      opt.setName("nickname").setDescription("New nickname (leave blank to clear it)").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const address = interaction.options.getString("address").trim();
    const chain = interaction.options.getString("chain");
    const nickname = interaction.options.getString("nickname");

    const existing = findWallet({ guildId: interaction.guildId, address, chain });
    if (!existing) {
      return interaction.reply({
        content: "That wallet isn't tracked in this server yet. Use `/track` first.",
        ephemeral: true,
      });
    }

    updateNickname({ guildId: interaction.guildId, address, chain, nickname });

    if (nickname) {
      await interaction.reply(`✏️ Renamed \`${address}\` (${CHAINS[chain].label}) to **${nickname}**.`);
    } else {
      await interaction.reply(`✏️ Cleared the nickname for \`${address}\` (${CHAINS[chain].label}).`);
    }
  },
};