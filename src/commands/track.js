const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { addWallet } = require("../db");
const { CHAINS, chainChoices } = require("../utils/chains");
const { isValidAddress } = require("../utils/validate");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("track")
    .setDescription("Start tracking a wallet's buys/sells and PnL")
    .addStringOption((opt) =>
      opt.setName("address").setDescription("Wallet address to track").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("chain")
        .setDescription("Blockchain")
        .setRequired(true)
        .addChoices(...chainChoices())
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

    // Reject malformed input up front. Without this the bot happily "tracks" a
    // typo'd address forever and never produces a single alert.
    if (!isValidAddress(address, chain)) {
      const expected =
        chain === "solana"
          ? "a base58 Solana address (32-44 characters)"
          : "a 0x-prefixed 40-character hex address";
      return interaction.reply({
        content: `That doesn't look like ${expected}. Please check the address and try again.`,
        ephemeral: true,
      });
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
