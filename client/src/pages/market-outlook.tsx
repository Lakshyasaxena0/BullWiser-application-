import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Minus, RefreshCw, Lock } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

type Horizon = '1w' | '2w' | '3w' | '1m' | '2m' | '4m' | '6m' | '1y';

interface SectorOutlook {
  sector: string;
  probUpPct: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  strength: 'strong' | 'moderate' | 'weak';
  confidence: number;
  changeEstimate: number;
  rangeLow: number;
  rangeHigh: number;
  statsScore: number;
  astroScore: number;
  keyFactors: string[];
  risks: string[];
  topStock: string;
  topStockChange: number;
}

interface CryptoOutlook {
  symbol: string;
  probUpPct: number;
  name: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  strength: 'strong' | 'moderate' | 'weak';
  confidence: number;
  changeEstimate: number;
  rangeLow: number;
  rangeHigh: number;
  currentPrice: number;
  statsScore: number;
  astroScore: number;
  keyFactors: string[];
  risks: string[];
}

// Helper function to format date in Indian format with IST timezone
function formatIndianDateTime(isoString: string): string {
  const date = new Date(isoString);
  
  // Format: DD/MM/YYYY, HH:MM AM/PM IST
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  
  return `${day}/${month}/${year}, ${hours}:${minutes} ${ampm}`;
}

// Helper function to format just the date in Indian format
function formatIndianDate(isoString: string): string {
  const date = new Date(isoString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function Section({ icon, title, empty, children }: { icon: React.ReactNode; title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div>
      <h2 className="text-lg font-semibold flex items-center space-x-2 mb-3">{icon}<span>{title}</span></h2>
      {children.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
      ) : (
        <Card className="p-8 text-center bg-gray-50"><p className="text-gray-500">{empty}</p></Card>
      )}
    </div>
  );
}

export default function MarketOutlook() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedTab, setSelectedTab] = useState<'stocks' | 'crypto'>('stocks');
  const [horizon, setHorizon] = useState<Horizon>('1m');

  const { toast } = useToast();
  const [refreshNonce, setRefreshNonce] = useState(0);
  const { data: outlook, isLoading, isFetching, error, refetch } = useQuery({
    // stocks + crypto come back together, so switching tabs never re-fetches (or re-charges credits)
    queryKey: ['/api/market/outlook', { horizon, refreshNonce }],
    queryFn: async () => {
      const response = await fetch(`/api/market/outlook?horizon=${horizon}${refreshNonce ? '&refresh=1' : ''}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Failed to fetch outlook');
      return body;
    },
    enabled: isAuthenticated,
    retry: false,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const handleRefresh = async () => {
    setRefreshNonce(n => n + 1);             // new key → forces a fresh fetch that skips the server's 15-minute cache
    toast({ title: 'Refreshing outlook…', description: 'Pulling the latest prices and planetary positions.' });
  };

  const horizons: { value: Horizon; label: string }[] = [
    { value: '1w', label: '1 Week' },
    { value: '2w', label: '2 Weeks' },
    { value: '3w', label: '3 Weeks' },
    { value: '1m', label: '1 Month' },
    { value: '2m', label: '2 Months' },
    { value: '4m', label: '4 Months' },
    { value: '6m', label: '6 Months' },
    { value: '1y', label: '1 Year' },
  ];

  if (error) {
    const err = error as Error;
    if (/credits|recharge|subscription/i.test(err.message)) {
      return (
        <Card className="p-12 text-center">
          <Lock className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Credits Needed</h3>
          <p className="text-gray-600 mb-4">You don't have enough credits for this outlook. Recharge to continue.</p>
          <Button onClick={() => setLocation('/plans')}>Recharge Credits</Button>
        </Card>
      );
    }
  }

  const genericError = error && !/credits|recharge|subscription/i.test((error as Error).message) ? (error as Error).message : null;

  const renderSectorCard = (sector: SectorOutlook) => {
    const signalConfig = {
      bullish: { icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
      bearish: { icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
      neutral: { icon: Minus, color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' },
    };

    const config = signalConfig[sector.signal];
    const Icon = config.icon;

    return (
      <Card key={sector.sector} className={`${config.border}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2">
              <Icon className={`h-5 w-5 ${config.color}`} />
              <div>
                <CardTitle className="text-lg">{sector.sector}</CardTitle>
                <p className="text-xs text-gray-500">Top: {sector.topStock}</p>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-xl font-bold ${config.color}`}>
                {sector.changeEstimate > 0 ? '+' : ''}{sector.changeEstimate.toFixed(1)}%
              </div>
              <p className="text-xs text-gray-500">expected</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <Badge variant="outline" className={sector.signal}>
              {sector.signal}
            </Badge>
            <Badge variant="secondary">{sector.strength}</Badge>
            <span className="text-xs text-gray-600">{sector.confidence}% conf. · {sector.probUpPct}% chance of rise</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-500">Low: </span>
              <span className="font-medium text-red-600">{sector.rangeLow.toFixed(1)}%</span>
            </div>
            <div className="text-right">
              <span className="text-gray-500">High: </span>
              <span className="font-medium text-green-600">{sector.rangeHigh > 0 ? '+' : ''}{sector.rangeHigh.toFixed(1)}%</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Statistical</span>
              <span className="font-medium">{sector.statsScore}/100</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div 
                className="bg-blue-500 h-1.5 rounded-full" 
                style={{ width: `${sector.statsScore}%` }}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Astrological</span>
              <span className="font-medium">{sector.astroScore}/100</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div 
                className="bg-purple-500 h-1.5 rounded-full" 
                style={{ width: `${sector.astroScore}%` }}
              />
            </div>
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-blue-600 font-medium">Show details</summary>
            <div className="mt-2 space-y-2 text-gray-700">
              {sector.keyFactors.length > 0 && (
                <div>
                  <p className="font-medium">Key Factors:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {sector.keyFactors.map((factor, i) => (
                      <li key={i}>{factor}</li>
                    ))}
                  </ul>
                </div>
              )}
              {sector.risks.length > 0 && (
                <div>
                  <p className="font-medium text-red-600">Risks:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {sector.risks.map((risk, i) => (
                      <li key={i}>{risk}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        </CardContent>
      </Card>
    );
  };

  const renderCryptoCard = (crypto: CryptoOutlook) => {
    const signalConfig = {
      bullish: { icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
      bearish: { icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
      neutral: { icon: Minus, color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' },
    };

    const config = signalConfig[crypto.signal];
    const Icon = config.icon;

    return (
      <Card key={crypto.symbol} className={`${config.border}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2">
              <Icon className={`h-5 w-5 ${config.color}`} />
              <div>
                <CardTitle className="text-lg">{crypto.symbol}</CardTitle>
                <p className="text-xs text-gray-500">{crypto.name}</p>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-xl font-bold ${config.color}`}>
                {crypto.changeEstimate > 0 ? '+' : ''}{crypto.changeEstimate.toFixed(1)}%
              </div>
              <p className="text-xs text-gray-500">expected</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <Badge variant="outline" className={crypto.signal}>
              {crypto.signal}
            </Badge>
            <Badge variant="secondary">{crypto.strength}</Badge>
            <span className="text-xs text-gray-600">{crypto.confidence}% conf. · {crypto.probUpPct}% chance of rise</span>
          </div>

          <div className="text-xs">
            <span className="text-gray-500">Current: </span>
            <span className="font-medium">${crypto.currentPrice.toLocaleString()}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-500">Low: </span>
              <span className="font-medium text-red-600">{crypto.rangeLow.toFixed(1)}%</span>
            </div>
            <div className="text-right">
              <span className="text-gray-500">High: </span>
              <span className="font-medium text-green-600">{crypto.rangeHigh > 0 ? '+' : ''}{crypto.rangeHigh.toFixed(1)}%</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Statistical</span>
              <span className="font-medium">{crypto.statsScore}/100</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div 
                className="bg-blue-500 h-1.5 rounded-full" 
                style={{ width: `${crypto.statsScore}%` }}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Astrological</span>
              <span className="font-medium">{crypto.astroScore}/100</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div 
                className="bg-purple-500 h-1.5 rounded-full" 
                style={{ width: `${crypto.astroScore}%` }}
              />
            </div>
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-blue-600 font-medium">Show details</summary>
            <div className="mt-2 space-y-2 text-gray-700">
              {crypto.keyFactors.length > 0 && (
                <div>
                  <p className="font-medium">Key Factors:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {crypto.keyFactors.map((factor, i) => (
                      <li key={i}>{factor}</li>
                    ))}
                  </ul>
                </div>
              )}
              {crypto.risks.length > 0 && (
                <div>
                  <p className="font-medium text-red-600">Risks:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {crypto.risks.map((risk, i) => (
                      <li key={i}>{risk}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center space-x-2">
            <TrendingUp className="h-6 w-6" />
            <span>Market Outlook</span>
          </h1>
          <p className="text-sm text-gray-600">
            Sector & crypto trend forecast using Statistical Analysis (55%) + Vedic Astrology (45%)
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={isFetching} size="sm" variant="outline" data-testid="button-refresh-outlook">
          <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {/* Tabs: Stocks vs Crypto */}
      <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as 'stocks' | 'crypto')}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="stocks">📈 Stocks</TabsTrigger>
          <TabsTrigger value="crypto">🪙 Crypto</TabsTrigger>
        </TabsList>

        {/* Time Horizon Selector */}
        <Card className="mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Time Horizon</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {horizons.map((h) => (
                <Button
                  key={h.value}
                  variant={horizon === h.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setHorizon(h.value)}
                >
                  {h.label}
                </Button>
              ))}
            </div>
            {outlook && (
              <div className="mt-3 space-y-1 text-xs text-gray-600">
                <p className="flex items-center gap-2">
                  <span className="font-medium">🕐 Generated:</span>
                  <span>{formatIndianDateTime(outlook.generatedAt)}</span>
                </p>
                <p className="flex items-center gap-2">
                  <span className="font-medium">🎯 Target:</span>
                  <span>{formatIndianDate(outlook.targetDate)}</span>
                  <span className="text-gray-500">({outlook.daysAhead} days ahead)</span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Market Summary */}
        {outlook?.marketSummary && (
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <p className="text-sm text-blue-900">{outlook.marketSummary}</p>
            </CardContent>
          </Card>
        )}

        {genericError && (
          <Card className="mt-4 border-red-200 bg-red-50"><CardContent className="pt-6 text-sm text-red-700">
            Could not load the outlook: {genericError}. Press Refresh to try again.
          </CardContent></Card>
        )}

        {/* Stocks Tab */}
        <TabsContent value="stocks" className="space-y-6">
          {isLoading ? (
            <div className="text-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="mt-2 text-gray-600">Analysing sector histories and planetary positions…</p>
            </div>
          ) : outlook?.stocks ? (
            <>
              <Section icon={<TrendingUp className="h-5 w-5 text-green-600" />} title="Top 4 Sectors — expected to perform best" empty="No sector is expected to rise over this horizon">
                {outlook.stocks.topBullish.map(renderSectorCard)}
              </Section>
              <Section icon={<TrendingDown className="h-5 w-5 text-red-600" />} title="Bearish — top 4 sectors expected to fall" empty="No sector is expected to fall over this horizon">
                {outlook.stocks.topBearish.map(renderSectorCard)}
              </Section>
              {outlook.stocks.unavailable?.length > 0 && (
                <p className="text-xs text-gray-500">Price data unavailable right now for: {outlook.stocks.unavailable.join(', ')} (excluded, not estimated).</p>
              )}
            </>
          ) : null}
        </TabsContent>

        {/* Crypto Tab */}
        <TabsContent value="crypto" className="space-y-6">
          {isLoading ? (
            <div className="text-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="mt-2 text-gray-600">Analysing coin histories and planetary positions…</p>
            </div>
          ) : outlook?.crypto ? (
            <>
              <Section icon={<TrendingUp className="h-5 w-5 text-green-600" />} title="Top 4 Coins — expected to perform best" empty="No coin is expected to rise over this horizon">
                {outlook.crypto.topBullish.map(renderCryptoCard)}
              </Section>
              <Section icon={<TrendingDown className="h-5 w-5 text-red-600" />} title="Bearish — top 4 coins expected to fall" empty="No coin is expected to fall over this horizon">
                {outlook.crypto.topBearish.map(renderCryptoCard)}
              </Section>
              {outlook.crypto.unavailable?.length > 0 && (
                <p className="text-xs text-gray-500">Price data unavailable right now for: {outlook.crypto.unavailable.join(', ')} (excluded, not estimated).</p>
              )}
            </>
          ) : null}
        </TabsContent>
      </Tabs>

      {/* Disclaimer */}
      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="pt-6">
          <p className="text-xs text-amber-800">
            <strong>How this is made:</strong> {outlook?.method || 'Statistics 55% (the asset’s own price history) + Vedic astrology 45% (sidereal sky across the chosen period).'}{' '}
            <strong>Disclaimer:</strong> an estimate, not a guarantee or financial advice. BullWiser does not buy or sell anything; you are responsible for your own profit or loss.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
