import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Activity, Flame } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

type Tone = "green" | "red" | "blue";
const TONES: Record<Tone, { row: string; text: string }> = {
  green: { row: "bg-green-50 hover:bg-green-100", text: "text-green-600" },
  red: { row: "bg-red-50 hover:bg-red-100", text: "text-red-600" },
  blue: { row: "bg-blue-50 hover:bg-blue-100", text: "text-blue-600" },
};

function Column({ title, icon, tone, stocks, empty, onPick }: { title: string; icon: React.ReactNode; tone: Tone; stocks: any[]; empty: string; onPick: (s: string) => void }) {
  const t = TONES[tone];
  return (
    <div>
      <div className={`flex items-center gap-2 mb-3 text-xs font-semibold uppercase tracking-wide ${t.text}`}>{icon}<span>{title}</span></div>
      <div className="space-y-2">
        {stocks.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">{empty}</p>
        ) : stocks.map((stock) => {
          const pct = Number(stock.changePercent) || 0;
          return (
            <div key={stock.symbol} className={`flex items-center justify-between p-3 rounded-lg transition-colors cursor-pointer ${t.row}`} onClick={() => onPick(stock.symbol)}>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900">{stock.symbol}</p>
                {stock.companyName && <p className="text-xs text-gray-500 truncate max-w-[150px]">{stock.companyName}</p>}
              </div>
              <div className="text-right">
                <p className="font-semibold text-sm text-gray-900">₹{Number(stock.lastPrice).toFixed(2)}</p>
                <p className={`text-xs font-medium ${pct >= 0 ? "text-green-600" : "text-red-600"}`}>{pct >= 0 ? "+" : ""}{pct.toFixed(2)}%</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TrendingStocks() {
  const [, setLocation] = useLocation();
  const { data: marketData, isLoading, dataUpdatedAt } = useQuery<any>({
    queryKey: ["/api/market/overview"],
    refetchInterval: 60000,
  });

  const gainers = marketData?.topGainers?.slice(0, 5) || [];
  const losers = marketData?.topLosers?.slice(0, 5) || [];
  const active = marketData?.mostActive?.slice(0, 5) || [];
  const pick = (symbol: string) => setLocation(`/predictions?symbol=${symbol}`);

  return (
    <Card className="shadow-sm border border-gray-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-semibold">Trending Stocks — Gainers &amp; Losers</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setLocation("/predictions")} className="text-primary hover:text-primary/80">
            Make Prediction →
          </Button>
        </div>
        <p className="text-xs text-gray-500">Live scan of about 100 liquid NSE stocks — whatever is moving the most today, not a fixed list.</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[200px] flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Column title="Top Gainers" tone="green" icon={<TrendingUp className="h-4 w-4" />} stocks={gainers} empty="No gainers right now (market closed or data unavailable)" onPick={pick} />
            <Column title="Top Losers" tone="red" icon={<TrendingDown className="h-4 w-4" />} stocks={losers} empty="No losers right now (market closed or data unavailable)" onPick={pick} />
            <Column title="Most Traded (by value)" tone="blue" icon={<Flame className="h-4 w-4" />} stocks={active} empty="No data available" onPick={pick} />
          </div>
        )}
        <div className="pt-4 mt-4 border-t border-gray-200 flex items-center gap-2 text-xs text-gray-400">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span>Updates every 60s{dataUpdatedAt ? ` · last updated ${new Date(dataUpdatedAt).toLocaleTimeString("en-IN")}` : ""}</span>
        </div>
      </CardContent>
    </Card>
  );
}
