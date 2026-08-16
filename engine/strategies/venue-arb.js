// Cross-venue prediction-market arbitrage. The same event trades on two
// venues (symbols "EVENT@A" and "EVENT@B"). When the quotes diverge by more
// than fees/slippage, buy the cheap venue and short the rich one, then close
// both legs when the quotes converge. Each leg trades independently through
// the normal engine path, so the pair position builds naturally as the engine
// processes each symbol's bar.

export const DEFAULTS = {
  entrySpread: 0.04, // $ divergence needed to open (must clear ~2c round-trip slippage)
  exitSpread: 0.01,  // close legs once venues agree within this
  stopSpread: 0.12,  // give up if the divergence blows out this far
  minPrice: 0.05,    // ignore near-resolved contracts
  maxPrice: 0.95,
};

function peerOf(symbol) {
  if (symbol.endsWith("@A")) return symbol.slice(0, -2) + "@B";
  if (symbol.endsWith("@B")) return symbol.slice(0, -2) + "@A";
  return null;
}

export function makeVenueArb(params = {}) {
  const p = { ...DEFAULTS, ...params };
  return {
    name: "venue-arb",
    markets: ["prediction-arb"],
    warmup: 5,
    params: p,

    onBar({ symbol, closes, position, all }) {
      const peer = peerOf(symbol);
      if (!peer) return null;
      const peerBars = all.get(peer);
      if (!peerBars?.length) return null;

      const mine = closes.at(-1);
      const theirs = peerBars.at(-1).close;
      const spread = mine - theirs; // positive = this venue is rich

      if (position) {
        if (Math.abs(spread) <= p.exitSpread) return { action: "exit", note: "venues converged" };
        return null;
      }

      if (mine < p.minPrice || mine > p.maxPrice || theirs < p.minPrice || theirs > p.maxPrice) return null;

      // This venue rich → short it here (the engine will long the cheap venue
      // when it processes the peer symbol's bar, completing the pair).
      if (spread >= p.entrySpread) {
        return {
          action: "enter", side: "short",
          stopPrice: Math.min(mine + (p.stopSpread - p.entrySpread), 0.99),
          targetPrice: Math.max(theirs + p.exitSpread / 2, 0.01),
          note: `rich by ${(spread * 100).toFixed(1)}c vs ${peer}`,
        };
      }
      if (spread <= -p.entrySpread) {
        return {
          action: "enter", side: "long",
          stopPrice: Math.max(mine - (p.stopSpread - p.entrySpread), 0.01),
          targetPrice: Math.min(theirs - p.exitSpread / 2, 0.99),
          note: `cheap by ${(-spread * 100).toFixed(1)}c vs ${peer}`,
        };
      }
      return null;
    },
  };
}
