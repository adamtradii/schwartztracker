export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") { out.help = true; continue; }
    if (a.startsWith("--")) {
      const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = /^-?\d+(\.\d+)?$/.test(next) ? Number(next) : next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  if (out.symbols && typeof out.symbols === "string") out.symbols = out.symbols.split(",");
  return out;
}

export function pickDefaultStrategy(market) {
  if (market === "prediction") return "extreme-fade";
  if (market === "prediction-arb") return "venue-arb";
  return "sma-crossover";
}
