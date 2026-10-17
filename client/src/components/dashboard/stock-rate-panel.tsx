import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Search, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export default function StockRatePanel() {
  const [stockSymbol, setStockSymbol] = useState("");
  const [searchedStock, setSearchedStock] = useState("");

  // ✅ Fix: use full API path as query key so fetch hits /api/stock/TCS not /api/stock
  const { data: stockData, isLoading, error } = useQuery<any>({
    queryKey: [`/api/stock/${searchedStock}`],
    enabled: !!searchedStock,
    refetchInterval: 30000,
    retry: 1,
  });

  const handleSearch = () => {
    if (stockSymbol.trim()) {
      setSearchedStock(stockSymbol.trim().toUpperCase());
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const getChangeColor = (change: number) =>
    change >= 0 ? "text-green-600" : "text-red-600";

  const getChangeIcon = (change: number) =>
    change >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />;

  return (
    <Card className="shadow-sm border border-gray-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Search className="h-5 w-5" />
          Stock Rate Checker
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Enter symbol (e.g., RELIANCE, TCS)"
            value={stockSymbol}
            onChange={(e) => setStockSymbol(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1"
          />
          <Button
            onClick={handleSearch}
            disabled={!stockSymbol.trim() || isLoading}
            size="sm"
          >
            {isLoading ? "..." : "Get Rate"}
          </Button>
        </div>

        {/* Error state */}
        {error && searchedStock && (
          <div className="text-center py-4 text-red-500 text-sm">
            ❌ Stock "{searchedStock}" not found. Try: RELIANCE, TCS, HDFCBANK, INFY
          </div>
        )}

        {/* Stock data */}
        {stockData && !error && (
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">{searchedStock}</h3>
                {stockData.companyName && (
                  <p className="text-xs text-gray-500">{stockData.companyName}</p>
                )}
                <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                  <Clock className="h-3 w-3" />
                  {stockData.exchange} • Live
                </p>
              </div>
              <Badge className="bg-blue-100 text-blue-800">Live Data</Badge>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Current Price</p>
                <p className="text-2xl font-bold text-gray-900">
                  ₹{stockData.lastPrice?.toFixed(2) || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Change</p>
                <div className={`flex items-center gap-1 ${getChangeColor(stockData.changePercent || 0)}`}>
                  {getChangeIcon(stockData.changePercent || 0)}
                  <span className="text-lg font-semibold">
                    {stockData.changePercent > 0 ? '+' : ''}
                    {stockData.changePercent?.toFixed(2) || '0.00'}%
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-gray-500">Open</p>
                <p className="font-semibold">₹{stockData.openPrice?.toFixed(2) || 'N/A'}</p>
              </div>
              <div>
                <p className="text-gray-500">High</p>
                <p className="font-semibold text-green-600">₹{stockData.highPrice?.toFixed(2) || 'N/A'}</p>
              </div>
              <div>
                <p className="text-gray-500">Low</p>
                <p className="font-semibold text-red-600">₹{stockData.lowPrice?.toFixed(2) || 'N/A'}</p>
              </div>
            </div>

            {stockData.volume > 0 && (
              <div className="pt-2 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  Volume: {stockData.volume.toLocaleString('en-IN')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!searchedStock && (
          <div className="text-center py-8 text-gray-500">
            <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Enter a stock symbol to check current rates</p>
            <p className="text-xs mt-1 text-gray-400">Try: RELIANCE, TCS, HDFCBANK, INFY, SBIN</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
