import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from "lucide-react";

interface MarketOverviewProps {
  marketData?: any;
}

export default function MarketOverview({ marketData }: MarketOverviewProps) {
  const indices = marketData?.indices || {
    nifty50:   { value: 0, change: 0, changePercent: 0 },
    sensex:    { value: 0, change: 0, changePercent: 0 },
    bankNifty: { value: 0, change: 0, changePercent: 0 },
  };

  const trending: any[] = marketData?.topGainers?.length
    ? marketData.topGainers
    : marketData?.mostActive?.length
    ? marketData.mostActive
    : [];

  const getChangeColor = (change: number) =>
    change >= 0 ? "text-green-600" : "text-red-600";

  const getChangeIcon = (change: number) =>
    change >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />;

  const getCompanyInitial = (symbol: string) => symbol.charAt(0);

  const getCompanyColor = (symbol: string) => {
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-purple-500',
      'bg-red-500', 'bg-yellow-500', 'bg-indigo-500',
    ];
    return colors[symbol.length % colors.length];
  };

  const formatPercent = (val: number) => {
    const fixed = val.toFixed(2);
    return val > 0 ? `+${fixed}%` : `${fixed}%`;
  };

  const formatValue = (val: number) => {
    if (!val) return '—';
    return val.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  };

  return (
    <div className="space-y-6">
      {/* Market Summary */}
      <Card className="shadow-sm border border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg font-semibold" data-testid="text-market-overview-title">
            Market Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* NIFTY 50 */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">NIFTY 50</span>
            <div className="text-right flex items-center space-x-2">
              <span className="font-semibold text-gray-900" data-testid="text-nifty-value">
                {formatValue(indices.nifty50.value)}
              </span>
              <Badge
                className={`${getChangeColor(indices.nifty50.changePercent)} bg-transparent border-0 p-0 text-sm`}
                data-testid="badge-nifty-change"
              >
                {getChangeIcon(indices.nifty50.changePercent)}
                {formatPercent(indices.nifty50.changePercent)}
              </Badge>
            </div>
          </div>

          {/* SENSEX */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">SENSEX</span>
            <div className="text-right flex items-center space-x-2">
              <span className="font-semibold text-gray-900" data-testid="text-sensex-value">
                {formatValue(indices.sensex.value)}
              </span>
              <Badge
                className={`${getChangeColor(indices.sensex.changePercent)} bg-transparent border-0 p-0 text-sm`}
                data-testid="badge-sensex-change"
              >
                {getChangeIcon(indices.sensex.changePercent)}
                {formatPercent(indices.sensex.changePercent)}
              </Badge>
            </div>
          </div>

          {/* Bank NIFTY */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Bank NIFTY</span>
            <div className="text-right flex items-center space-x-2">
              <span className="font-semibold text-gray-900" data-testid="text-bank-nifty-value">
                {formatValue(indices.bankNifty.value)}
              </span>
              <Badge
                className={`${getChangeColor(indices.bankNifty.changePercent)} bg-transparent border-0 p-0 text-sm`}
                data-testid="badge-bank-nifty-change"
              >
                {getChangeIcon(indices.bankNifty.changePercent)}
                {formatPercent(indices.bankNifty.changePercent)}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trending Stocks */}
      <Card className="shadow-sm border border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg font-semibold" data-testid="text-trending-title">
            Trending Stocks
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trending.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">
              Loading live stock data...
            </div>
          ) : (
            <div className="flex space-x-3 overflow-x-auto scrollbar-hide pb-2">
              {trending.slice(0, 10).map((stock: any, index: number) => {
                const price = stock.lastPrice ?? stock.price ?? 0;
                const changePct = stock.changePercent ?? stock.change ?? 0;
                return (
                  <div
                    key={stock.symbol}
                    className="flex-shrink-0 bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors min-w-[140px]"
                  >
                    <div className="flex flex-col items-center space-y-2">
                      <div className={`w-8 h-8 ${getCompanyColor(stock.symbol)} rounded-full flex items-center justify-center text-white text-sm font-semibold`}>
                        {getCompanyInitial(stock.symbol)}
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-gray-900 text-sm truncate" data-testid={`text-trending-symbol-${index}`}>
                          {stock.symbol}
                        </p>
                        <p className="text-xs text-gray-500" data-testid={`text-trending-price-${index}`}>
                          ₹{price > 0 ? price.toFixed(2) : '—'}
                        </p>
                      </div>
                      <Badge
                        className={`${getChangeColor(changePct)} bg-transparent border-0 p-0 text-xs font-medium`}
                        data-testid={`badge-trending-change-${index}`}
                      >
                        {getChangeIcon(changePct)}
                        {formatPercent(changePct)}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
