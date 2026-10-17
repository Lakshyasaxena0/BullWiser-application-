import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function TrendingStocks() {
  const [, setLocation] = useLocation();
  
  const { data: marketData, isLoading } = useQuery<any>({
    queryKey: ["/api/market/overview"],
    refetchInterval: 60000, // Refresh every 60 seconds
  });

  const topGainers = marketData?.topGainers?.slice(0, 5) || [];
  const topLosers = marketData?.topLosers?.slice(0, 5) || [];

  if (isLoading) {
    return (
      <Card className="shadow-sm border border-gray-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold">Trending Stocks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm border border-gray-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-semibold">Trending Stocks</CardTitle>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setLocation('/predictions')}
            className="text-primary hover:text-primary/80"
          >
            Make Prediction →
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Top Gainers */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Top Gainers</p>
          </div>
          <div className="space-y-2">
            {topGainers.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No gainers data available</p>
            ) : (
              topGainers.map((stock: any) => (
                <div 
                  key={stock.symbol} 
                  className="flex items-center justify-between p-3 bg-green-50 rounded-lg hover:bg-green-100 transition-colors cursor-pointer"
                  onClick={() => setLocation(`/predictions?symbol=${stock.symbol}`)}
                >
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-gray-900">{stock.symbol}</p>
                    {stock.companyName && (
                      <p className="text-xs text-gray-500 truncate max-w-[150px]">{stock.companyName}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm text-gray-900">
                      ₹{stock.lastPrice?.toFixed(2) || 'N/A'}
                    </p>
                    <div className="flex items-center gap-1 text-green-600 text-xs font-medium">
                      <TrendingUp className="h-3 w-3" />
                      +{stock.changePercent?.toFixed(2) || '0.00'}%
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Losers */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="h-4 w-4 text-red-600" />
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Top Losers</p>
          </div>
          <div className="space-y-2">
            {topLosers.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No losers data available</p>
            ) : (
              topLosers.map((stock: any) => (
                <div 
                  key={stock.symbol} 
                  className="flex items-center justify-between p-3 bg-red-50 rounded-lg hover:bg-red-100 transition-colors cursor-pointer"
                  onClick={() => setLocation(`/predictions?symbol=${stock.symbol}`)}
                >
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-gray-900">{stock.symbol}</p>
                    {stock.companyName && (
                      <p className="text-xs text-gray-500 truncate max-w-[150px]">{stock.companyName}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm text-gray-900">
                      ₹{stock.lastPrice?.toFixed(2) || 'N/A'}
                    </p>
                    <div className="flex items-center gap-1 text-red-600 text-xs font-medium">
                      <TrendingDown className="h-3 w-3" />
                      {stock.changePercent?.toFixed(2) || '0.00'}%
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Live indicator */}
        <div className="pt-2 border-t border-gray-200">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span>Live data • Updates every 60s</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
