const { EmbedBuilder } = require("discord.js");
const { CHAINS } = require("./chains");

function fmtUsd(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n === 0) return "$0";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  // Values under a cent would otherwise round down to "$0" and look like an error —
  // show a couple extra decimal places for those instead of collapsing to zero.
  if (abs < 0.01) {
    let str = abs.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
    return `${sign}$${str}`;
  }
  return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

// Memecoin prices are often extremely small (e.g. 0.0000000003169), and JS's default
// string conversion switches to ugly scientific notation ("3.169e-10") below a threshold.
// This expands it into full, readable decimal instead.
function fmtPrice(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n === 0) return "$0";
  if (Math.abs(n) >= 0.01) {
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 6 })}`;
  }
  // Very small price — show enough decimal places to capture ~4 significant figures,
  // fully expanded (no exponential notation).
  const leadingZeros = Math.max(0, -Math.floor(Math.log10(Math.abs(n))) - 1);
  const decimals = Math.min(leadingZeros + 5, 18); // cap to avoid absurdly long strings
  let str = n.toFixed(decimals);
  str = str.replace(/0+$/, "").replace(/\.$/, ""); // trim trailing zeros
  return `$${str}`;
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
      `**Wallet Address:** \`${wallet.address}\`\n` +
      `**Token CA:** \`${trade.tokenAddress || "—"}\``
    )
    .addFields(
      { name: "Amount", value: trade.amountToken ? trade.amountToken.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—", inline: true },
      { name: "USD Value", value: fmtUsd(trade.amountUsd), inline: true },
      { name: "Price", value: fmtPrice(trade.priceUsd), inline: true }
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
      value: `Pool liquidity: ${fmtUsd(pairInfo.liquidityUsd)}`,
    });
  }

  // Always include a live chart link (not just fresh-ape trades) — one click gets you
  // current price/mcap even if you're checking this alert well after it fired.
  if (pairInfo?.url) {
    embed.addFields({ name: "📈 Live Chart", value: `[View on DexScreener](${pairInfo.url})` });
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