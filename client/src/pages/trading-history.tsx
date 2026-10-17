import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Bitcoin, BarChart2, TrendingUp } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";

type ViewType = "all" | "stocks" | "crypto";

export default function TradingHistoryPage() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const [activeView, setActiveView] = useState<ViewType>("all");

  const { data: predictions, isLoading } = useQuery<any[]>({
    queryKey: ["/api/user/predictions"],
    enabled: isAuthenticated,
  });

  const allTrades   = predictions || [];
  const stockTrades = allTrades.filter(p => !p.stock?.startsWith("CRYPTO_"));
  const cryptoTrades = allTrades.filter(p => p.stock?.startsWith("CRYPTO_"));

  // Stats — always reflect the full dataset regardless of active view
  const totalTrades   = allTrades.length;
  const activeTrades  = allTrades.filter(p => p.isActive).length;
  const avgConfidence = totalTrades > 0
    ? (allTrades.reduce((sum, p) => sum + (p.confidence || 0), 0) / totalTrades).toFixed(1)
    : 0;
  const winRate = totalTrades > 0
    ? ((allTrades.filter(p => (p.predHigh - p.currentPrice) > 0).length / totalTrades) * 100).toFixed(1)
    : 0;

  const visibleTrades =
    activeView === "stocks" ? stockTrades :
    activeView === "crypto" ? cryptoTrades :
    allTrades;

  const getStatusBadge = (isActive: boolean) =>
    isActive
      ? <Badge className="bg-blue-100 text-blue-800">Active</Badge>
      : <Badge className="bg-gray-100 text-gray-800">Past</Badge>;

  const getConfidenceColor = (c: number) =>
    c >= 70 ? "text-green-600" : c >= 50 ? "text-amber-600" : "text-red-600";

  // ── Sliding 3-way toggle ──────────────────────────────────────────────────
  const views: { key: ViewType; label: string; count: number }[] = [
    { key: "all",    label: "All",    count: allTrades.length },
    { key: "stocks", label: "Stocks", count: stockTrades.length },
    { key: "crypto", label: "Crypto", count: cryptoTrades.length },
  ];

  const activeIndex = views.findIndex(v => v.key === activeView);

  const ViewToggle = () => (
    <div className="space-y-2">
      <div className="relative flex items-center w-full max-w-sm rounded-xl border border-gray-200 bg-gray-100 p-1 cursor-pointer select-none">
        {/* Sliding pill */}
        <div
          className="absolute top-1 bottom-1 rounded-lg shadow-sm transition-all duration-300 ease-in-out bg-blue-600"
          style={{
            width: `calc(${100 / 3}% - 5px)`,
            left: `calc(${activeIndex} * ${100 / 3}% + 4px)`,
          }}
        />
        {views.map(v => (
          <button
            key={v.key}
            onClick={() => setActiveView(v.key)}
            className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold rounded-lg transition-colors duration-300
              ${activeView === v.key ? "text-white" : "text-gray-500 hover:text-gray-700"}`}
          >
            {v.key === "crypto" && <Bitcoin className="h-3.5 w-3.5" />}
            {v.key === "stocks" && <TrendingUp className="h-3.5 w-3.5" />}
            {v.key === "all"    && <BarChart2  className="h-3.5 w-3.5" />}
            {v.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold
              ${activeView === v.key ? "bg-white/25 text-white" : "bg-gray-200 text-gray-600"}`}>
              {v.count}
            </span>
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500">
        Viewing:{" "}
        <span className="font-semibold text-blue-600">
          {activeView === "all"    && "📊 All Predictions"}
          {activeView === "stocks" && "📈 Stock Predictions (NSE/BSE)"}
          {activeView === "crypto" && "₿ Crypto Predictions"}
        </span>
      </p>
    </div>
  );

  // ── Table renderer ────────────────────────────────────────────────────────
  const renderTable = (trades: any[]) => {
    const isCryptoView = activeView === "crypto";
    const showTypeCol  = activeView === "all";

    if (trades.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 space-y-3">
          <BarChart2 className="h-12 w-12 text-gray-300" />
          <p className="text-sm font-medium">
            No {activeView === "crypto" ? "crypto" : activeView === "stocks" ? "stock" : ""} predictions yet
          </p>
          <Button size="sm" variant="outline" onClick={() => setLocation("/predictions")}>
            Make a Prediction
          </Button>
        </div>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            {showTypeCol && <TableHead>Type</TableHead>}
            <TableHead>Entry Price</TableHead>
            <TableHead>Target Low</TableHead>
            <TableHead>Target High</TableHead>
            <TableHead>Confidence</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map((p: any) => {
            const isCryptoRow = p.stock?.startsWith("CRYPTO_");
            const symbol = isCryptoRow ? p.stock.replace("CRYPTO_", "") : p.stock;
            return (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center space-x-2">
                    {isCryptoRow
                      ? <Bitcoin className="h-4 w-4 text-orange-500" />
                      : <div className="w-4 h-4 bg-blue-500 rounded-full" />}
                    <span>{symbol}</span>
                  </div>
                </TableCell>
                {showTypeCol && (
                  <TableCell>
                    <Badge className={isCryptoRow
                      ? "bg-orange-100 text-orange-700"
                      : "bg-blue-100 text-blue-700"}>
                      {isCryptoRow ? "Crypto" : "Stock"}
                    </Badge>
                  </TableCell>
                )}
                <TableCell>₹{p.currentPrice?.toFixed(2) ?? "—"}</TableCell>
                <TableCell className="text-red-600">₹{p.predLow?.toFixed(2) ?? "—"}</TableCell>
                <TableCell className="text-green-600">₹{p.predHigh?.toFixed(2) ?? "—"}</TableCell>
                <TableCell className={getConfidenceColor(p.confidence)}>
                  {p.confidence?.toFixed(1)}%
                </TableCell>
                <TableCell>{p.createdAt ? new Date(p.createdAt).toLocaleDateString("en-IN") : "—"}</TableCell>
                <TableCell>{getStatusBadge(p.isActive)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/")}>
          <ChevronLeft className="h-4 w-4 mr-1" />Back to Dashboard
        </Button>
        <div className="border-l pl-4">
          <h1 className="text-2xl font-bold text-gray-900">Trading History</h1>
          <p className="text-gray-600">Track your stock and crypto prediction history</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-600">Total Predictions</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-gray-900">{totalTrades}</div><p className="text-sm text-gray-500">All time</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-600">Active</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-blue-600">{activeTrades}</div><p className="text-sm text-gray-500">Currently active</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-600">Avg Confidence</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{avgConfidence}%</div><p className="text-sm text-gray-500">Across all predictions</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-600">Bullish Rate</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-purple-600">{winRate}%</div><p className="text-sm text-gray-500">Upward predictions</p></CardContent>
        </Card>
      </div>

      {/* Toggle + Table */}
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle>
              {activeView === "all"    && "All Predictions"}
              {activeView === "stocks" && "Stock Prediction History"}
              {activeView === "crypto" && "Crypto Prediction History"}
            </CardTitle>
          </div>
          <ViewToggle />
        </CardHeader>
        <CardContent>
          {isLoading
            ? <div className="flex justify-center py-8"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>
            : renderTable(visibleTrades)}
        </CardContent>
      </Card>
    </div>
  );
}
