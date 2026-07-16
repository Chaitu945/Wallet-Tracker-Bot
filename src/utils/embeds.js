const { EmbedBuilder } = require("discord.js");
const { CHAINS } = require("./chains");

function fmtUsd(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function shortAddr(addr) {
  if (!addr) return "?";
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function tradeAlertEmbed({ wallet, trade, isFreshApe, pairInfo }) {
  const chainCfg = CHAINS[wallet.chain];
  const color = trade.side === "buy" ? 0x22c55e : 0xef4444;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${trade.side === "buy" ? "🟢 BUY" : "🔴 SELL"} — ${trade.tokenSymbol}`)
    .setDescription(
      `**Wallet:** ${wallet.nickname || shortAddr(wallet.address)} (${chainCfg.label})\n` +
      `**Token CA:** \`${trade.tokenAddress || "—"}\``
    )
    .addFields(
      { name: "Amount", value: trade.amountToken ? trade.amountToken.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—", inline: true },
      { name: "USD Value", value: fmtUsd(trade.amountUsd), inline: true },
      { name: "Price", value: trade.priceUsd ? `$${trade.priceUsd}` : "—", inline: true }
    )
    .setFooter({ text: shortAddr(wallet.address) })
    .setTimestamp(trade.blockTs * 1000);

  // Market cap (or FDV as fallback) shown on every trade — buy or sell — so you have
  // sizing context for deciding whether to ape in or exit.
  if (pairInfo?.marketCap || pairInfo?.fdv) {
    const usingMarketCap = Boolean(pairInfo.marketCap);
    embed.addFields({
      name: usingMarketCap ? "Market Cap" : "FDV",
      value: fmtUsd(usingMarketCap ? pairInfo.marketCap : pairInfo.fdv),
      inline: true,
    });
  }

  if (chainCfg?.explorer && trade.txHash) {
    embed.setURL(`${chainCfg.explorer}${trade.txHash}`);
  }

  if (isFreshApe && pairInfo) {
    embed.addFields({
      name: "🆕 Fresh Ape Alert",
      value: `Pool liquidity: ${fmtUsd(pairInfo.liquidityUsd)}\n[View chart](${pairInfo.url})`,
    });
  }

  return embed;
}

function pnlEmbed({ wallet, pnl }) {
  const chainCfg = CHAINS[wallet.chain];
  const embed = new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle(`📊 PnL — ${wallet.nickname || shortAddr(wallet.address)}`)
    .setDescription(`${chainCfg.label} · \`${wallet.address}\``)
    .addFields(
      { name: "Realized PnL", value: fmtUsd(pnl.totals.realized), inline: true },
      { name: "Unrealized PnL", value: fmtUsd(pnl.totals.unrealized), inline: true },
      { name: "Net PnL", value: fmtUsd(pnl.totals.realized + pnl.totals.unrealized), inline: true }
    );

  const topTokens = [...pnl.perToken]
    .sort((a, b) => (b.realizedPnlUsd + (b.unrealizedPnlUsd || 0)) - (a.realizedPnlUsd + (a.unrealizedPnlUsd || 0)))
    .slice(0, 10);

  if (topTokens.length > 0) {
    const lines = topTokens.map((t) => {
      const net = t.realizedPnlUsd + (t.unrealizedPnlUsd || 0);
      const emoji = net >= 0 ? "🟢" : "🔴";
      return `${emoji} **${t.symbol}** — realized: ${fmtUsd(t.realizedPnlUsd)}, unrealized: ${fmtUsd(t.unrealizedPnlUsd)}`;
    });
    embed.addFields({ name: "Per-token breakdown", value: lines.join("\n").slice(0, 1024) });
  } else {
    embed.addFields({ name: "Per-token breakdown", value: "No trades logged yet for this wallet." });
  }

  return embed;
}

module.exports = { tradeAlertEmbed, pnlEmbed, fmtUsd, shortAddr };