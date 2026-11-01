import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from "lucide-react";

interface MarketOverviewProps {
  marketData?: any;
}

const formatPercent = (val: number) => `${val > 0 ? "+" : ""}${val.toFixed(2)}%`;
const formatValue = (val: number) => val.toLocaleString("en-IN", { maximumFractionDigits: 2 });

// A row shows a number only when the live feed really delivered one; otherwise "—" (never a made-up 0.00%)
function IndexRow({ label, idx, id }: { label: string; idx?: { value?: number; changePercent?: number }; id: string }) {
  const has = !!idx && Number(idx.value) > 0;
  const pct = Number(idx?.changePercent) || 0;
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="text-right flex items-center space-x-2">
        <span className="font-semibold text-gray-900" data-testid={`text-${id}-value`}>{has ? formatValue(Number(idx!.value)) : "—"}</span>
        {has && (
          <Badge className={`${pct >= 0 ? "text-green-600" : "text-red-600"} bg-transparent border-0 p-0 text-sm`} data-testid={`badge-${id}-change`}>
            {pct >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {formatPercent(pct)}
          </Badge>
        )}
      </div>
    </div>
  );
}

export default function MarketOverview({ marketData }: MarketOverviewProps) {
  const indices = marketData?.indices || {};
  const anyLive = ["nifty50", "sensex", "bankNifty"].some((k) => Number(indices[k]?.value) > 0);
  return (
    <div className="space-y-6">
      <Card className="shadow-sm border border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg font-semibold" data-testid="text-market-overview-title">Market Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <IndexRow label="NIFTY 50" idx={indices.nifty50} id="nifty" />
          <IndexRow label="SENSEX" idx={indices.sensex} id="sensex" />
          <IndexRow label="Bank NIFTY" idx={indices.bankNifty} id="bank-nifty" />
          {!anyLive && <p className="text-xs text-gray-400">Live index data is not available right now.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
