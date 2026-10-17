import { Badge } from "@/components/ui/badge";

export default function LongTermStatsCard({ stats }: { stats?: any | null }) {
  if (!stats) return null;
  const f = stats.forecast, p = stats.profile, s = stats.seasonality;
  const tone = stats.signal === "bullish" ? "bg-green-100 text-green-800" : stats.signal === "bearish" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800";
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v}%`);
  return (
    <div className="p-4 bg-white border border-sky-300 rounded-lg space-y-2" data-testid="card-longterm-stats">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-gray-900">{Math.round(stats.yearsOfData)}-Year Statistics</p>
        <Badge className={tone}>{stats.signal} · {stats.score}/100</Badge>
      </div>
      <p className="text-xs text-gray-700">
        In similar past setups the stock rose in <strong>{f.probUpPct}%</strong> of {stats.horizonDays}-trading-day windows
        (all windows: {f.baseProbUpPct}%). Typical move {pct(f.medianReturnPct)}; likely range {pct(f.p10ReturnPct)} to {pct(f.p90ReturnPct)}
        (₹{f.rangeLow.toLocaleString("en-IN")} – ₹{f.rangeHigh.toLocaleString("en-IN")}).
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-700">
        <div><span className="text-gray-500">CAGR</span><br />{pct(p.cagrPct)}</div>
        <div><span className="text-gray-500">Volatility</span><br />{p.annualVolPct}%</div>
        <div><span className="text-gray-500">Worst drawdown</span><br />{p.maxDrawdownPct}%</div>
        <div><span className="text-gray-500">From all-time high</span><br />{p.currentDrawdownPct}%</div>
        <div><span className="text-gray-500">1y / 5y</span><br />{pct(p.returnsPct["1y"])} / {pct(p.returnsPct["5y"])}</div>
        <div><span className="text-gray-500">10y / 20y</span><br />{pct(p.returnsPct["10y"])} / {pct(p.returnsPct["20y"])}</div>
        <div><span className="text-gray-500">{s.month} avg ({s.samples}y)</span><br />{pct(s.avgMonthlyReturnPct)} · {s.monthlyWinRatePct}% up</div>
        <div><span className="text-gray-500">Backtest hit-rate</span><br />{stats.backtest.hitRatePct === null ? "n/a" : `${stats.backtest.hitRatePct}% (${stats.backtest.tests})`}</div>
      </div>
      {stats.keyRisks?.length > 0 && <p className="text-[11px] text-amber-700">{stats.keyRisks.join(" ")}</p>}
      <p className="text-[11px] text-gray-400">Based on {stats.bars.toLocaleString("en-IN")} daily bars. Past patterns do not guarantee future results.</p>
    </div>
  );
}
