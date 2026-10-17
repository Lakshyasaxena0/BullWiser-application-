import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp, TrendingDown, Clock, Target, Calendar,
  ChevronLeft, Search, Zap, BookmarkPlus, BookmarkCheck,
  ArrowUpRight, ArrowDownRight, Minus, Activity, BarChart2,
  AlertCircle, Info,
} from "lucide-react";
import { useLocation } from "wouter";
import LongTermStatsCard from "@/components/LongTermStatsCard";
import VedicInsightsCard from "@/components/VedicInsightsCard";
import FeedbackForm from "@/components/dashboard/feedback-form";

export default function Predictions() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("make");
  const [addingToWatchlist, setAddingToWatchlist] = useState<string | null>(null);
  const [addedToWatchlist, setAddedToWatchlist] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const [predType, setPredType] = useState<"stock" | "crypto">("stock");
  const [symbol, setSymbol] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [horizon, setHorizon] = useState("1w");
  const [mode, setMode] = useState("suggestion");
  const [riskLevel, setRiskLevel] = useState("medium");
  const [predResult, setPredResult] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchAttempted, setSearchAttempted] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setTimeout(() => { window.location.href = "/auth"; }, 500);
    }
  }, [isAuthenticated, isLoading]);

  // ★ Clear prediction result when horizon, symbol, or mode changes
  useEffect(() => {
    setPredResult(null);
  }, [horizon, symbol, mode, riskLevel, predType]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (searchQuery.length < 2) { setSearchResults([]); setSearchAttempted(false); return; }
      setIsSearching(true); setSearchAttempted(false);
      try {
        const endpoint = predType === "crypto"
          ? `/api/search/crypto?q=${encodeURIComponent(searchQuery)}`
          : `/api/search/stocks?q=${encodeURIComponent(searchQuery)}`;
        const res = await fetch(endpoint);
        if (res.ok) setSearchResults(await res.json() || []);
        else setSearchResults([]);
      } catch { setSearchResults([]); }
      finally { setIsSearching(false); setSearchAttempted(true); }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, predType]);

  const { data: predictions, isLoading: predsLoading } = useQuery({
    queryKey: ["/api/user/predictions"], enabled: isAuthenticated,
  });
  const { data: activePredictions } = useQuery({
    queryKey: ["/api/user/predictions/active"], enabled: isAuthenticated,
  });

  const getTargetDateFromHorizon = () => {
    if (targetDate) return targetDate;
    const d = new Date();
    if (horizon === "1d") d.setDate(d.getDate() + 1);
    else if (horizon === "1w") d.setDate(d.getDate() + 7);
    else if (horizon === "1m") d.setMonth(d.getMonth() + 1);
    else if (horizon === "3m") d.setMonth(d.getMonth() + 3);
    else if (horizon === "6m") d.setMonth(d.getMonth() + 6);
    else if (horizon === "1y") d.setFullYear(d.getFullYear() + 1);
    return d.toISOString();
  };

  const predictMutation = useMutation({
    mutationFn: async () => {
      if (!symbol) throw new Error("Please select a stock or crypto symbol");
      const when = getTargetDateFromHorizon();
      
      // ★ Add timestamp to force fresh prediction
      const timestamp = Date.now();
      
      if (predType === "stock") {
        const res = await apiRequest("POST", "/api/predict", { 
          stock: symbol, 
          when, 
          mode, 
          riskLevel,
          _timestamp: timestamp  // Force fresh calculation
        });
        return await res.json();
      } else {
        const res = await apiRequest("POST", "/api/crypto/predict", { 
          crypto: symbol, 
          when, 
          mode, 
          riskLevel, 
          tradesPerDay: 1, 
          cryptoValue: 10000, 
          duration: "daily",
          _timestamp: timestamp  // Force fresh calculation
        });
        return await res.json();
      }
    },
    onSuccess: (data: any) => {
      if (data?.error === "QUOTE_UNAVAILABLE") {
        toast({ title: "Symbol Not Found", description: data.message, variant: "destructive" });
        return;
      }
      setPredResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/user/predictions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/predictions/active"] });
      toast({ title: "Prediction Generated!", description: `${symbol} prediction ready` });
    },
    onError: (err: Error) => {
      toast({ title: "Prediction Failed", description: err.message, variant: "destructive" });
    },
  });

  const getWatchlistKey = (result: any): string => {
    if (!result) return "";
    return result.stock ? result.stock : `CRYPTO_${result.crypto || result.cryptoSymbol}`;
  };

  const addToWatchlistMutation = useMutation({
    mutationFn: (watchlistKey: string) => {
      setAddingToWatchlist(watchlistKey);
      return apiRequest("POST", "/api/user/watchlist", { stock: watchlistKey });
    },
    onSuccess: (_, watchlistKey) => {
      toast({ title: "Added to Watchlist!", description: `${watchlistKey.replace("CRYPTO_", "")} is now being tracked.` });
      setAddedToWatchlist(prev => new Set([...prev, watchlistKey]));
      setAddingToWatchlist(null);
      queryClient.invalidateQueries({ queryKey: ["/api/user/watchlist"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add to watchlist", variant: "destructive" });
      setAddingToWatchlist(null);
    },
  });

  if (isLoading || predsLoading) {
    return <div className="flex items-center justify-center h-full"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  const getConfidenceColor = (c: number) => c >= 80 ? "bg-green-100 text-green-800" : c >= 60 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800";
  const getRiskColor = (r: string) => r === "low" ? "bg-green-100 text-green-800" : r === "medium" ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800";
  const pastPredictions = (predictions as any[])?.filter((p: any) => !(activePredictions as any[])?.some((ap: any) => ap.id === p.id)) || [];

  // ── Derived prediction metrics ───────────────────────────────────────────
  const getPredictionMetrics = (result: any) => {
    if (!result) return null;
    const price = result.currentPrice || 0;
    const low   = result.predLow   || 0;
    const high  = result.predHigh  || 0;
    const mid   = (low + high) / 2;
    const upside   = price > 0 ? (((high - price) / price) * 100).toFixed(2) : "0.00";
    const downside = price > 0 ? (((price - low)  / price) * 100).toFixed(2) : "0.00";
    const midChange = price > 0 ? (((mid - price)  / price) * 100).toFixed(2) : "0.00";
    const range = (high - low).toFixed(2);
    return { upside, downside, midChange, range, mid: mid.toFixed(2) };
  };

  // ★ Get human-readable horizon text
  const getHorizonText = () => {
    if (horizon === "custom") return new Date(targetDate).toLocaleDateString("en-IN");
    if (horizon === "1d") return "tomorrow";
    if (horizon === "1w") return "next week";
    if (horizon === "1m") return "next month";
    if (horizon === "3m") return "3 months";
    if (horizon === "6m") return "6 months";
    if (horizon === "1y") return "next year";
    return horizon;
  };

  // ── Sliding toggle ───────────────────────────────────────────────────────
  const PredTypeToggle = () => {
    const isStock = predType === "stock";
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-700">Prediction Type</Label>
        <div
          className="relative flex items-center w-full rounded-xl border border-gray-200 bg-gray-100 p-1 cursor-pointer select-none"
          onClick={() => {
            const next = isStock ? "crypto" : "stock";
            setPredType(next as "stock" | "crypto");
            setSymbol(""); setSearchQuery(""); setSearchResults([]); setSearchAttempted(false);
            setPredResult(null);  // ★ Clear result when switching type
          }}
        >
          <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg shadow-sm transition-all duration-300 ease-in-out
            ${isStock ? "left-1 bg-blue-600" : "left-[calc(50%+3px)] bg-orange-500"}`} />
          <div className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors duration-300
            ${isStock ? "text-white" : "text-gray-400"}`}>
            <TrendingUp className="h-4 w-4" />Stocks
          </div>
          <div className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors duration-300
            ${!isStock ? "text-white" : "text-gray-400"}`}>
            <span className="font-bold">₿</span>Crypto
          </div>
        </div>
        <p className="text-xs text-center text-gray-500">
          Predicting:{" "}
          <span className={`font-semibold ${isStock ? "text-blue-600" : "text-orange-500"}`}>
            {isStock ? "📈 Indian Stocks (NSE / BSE)" : "₿ Cryptocurrencies"}
          </span>
        </p>
      </div>
    );
  };

  const PredictionCard = ({ prediction, isPast = false }: { prediction: any; isPast?: boolean }) => {
    const midPrice = (prediction.predLow + prediction.predHigh) / 2;
    const isUptrend = midPrice > prediction.currentPrice;
    const wKey = prediction.stock;
    return (
      <Card className={`hover:shadow-lg transition-shadow ${isPast ? "opacity-80" : ""}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">{prediction.stock}</CardTitle>
            <div className="flex items-center space-x-2">
              {isUptrend ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
              <Badge className={getConfidenceColor(prediction.confidence)}>{prediction.confidence}% conf.</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            <Badge className={getRiskColor(prediction.riskLevel)}>{prediction.riskLevel} risk</Badge>
            <Badge variant="outline">{prediction.mode}</Badge>
            {isPast && <Badge variant="secondary"><Calendar className="h-3 w-3 mr-1" />Completed</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-sm text-center">
            <div><p className="text-gray-500">{isPast ? "Initial" : "Current"}</p><p className="font-semibold">₹{prediction.currentPrice?.toFixed(2)}</p></div>
            <div><p className="text-gray-500">Pred. Low</p><p className="font-semibold text-red-600">₹{prediction.predLow?.toFixed(2)}</p></div>
            <div><p className="text-gray-500">Pred. High</p><p className="font-semibold text-green-600">₹{prediction.predHigh?.toFixed(2)}</p></div>
          </div>
          <div className="flex items-center justify-between text-sm text-gray-500">
            <div className="flex items-center"><Clock className="h-4 w-4 mr-1" />{new Date(prediction.createdAt).toLocaleDateString("en-IN")}</div>
            {prediction.targetDate && <div className="flex items-center"><Target className="h-4 w-4 mr-1" />{new Date(prediction.targetDate).toLocaleDateString("en-IN")}</div>}
          </div>
          {!isPast && (
            <Button size="sm"
              variant={addedToWatchlist.has(wKey) ? "default" : "outline"}
              className={`w-full gap-2 ${addedToWatchlist.has(wKey) ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
              onClick={() => addToWatchlistMutation.mutate(wKey)}
              disabled={addingToWatchlist === wKey || addedToWatchlist.has(wKey)}>
              {addingToWatchlist === wKey ? "Adding..." : addedToWatchlist.has(wKey) ? <><BookmarkCheck className="h-3 w-3" /> Added</> : "Add to Watchlist"}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="flex items-center">
          <ChevronLeft className="h-4 w-4 mr-1" />Back to Dashboard
        </Button>
        <div className="border-l pl-4">
          <h1 className="text-2xl font-bold text-gray-900">Predictions</h1>
          <p className="text-gray-600">Make AI-powered predictions for stocks and cryptocurrencies</p>
        </div>
      </div>

      <Tabs defaultValue="make" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="make"><Zap className="h-4 w-4 mr-1" />Make Prediction</TabsTrigger>
          <TabsTrigger value="active">Active ({(activePredictions as any[])?.length || 0})</TabsTrigger>
          <TabsTrigger value="past">Past ({pastPredictions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="make" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Form */}
            <Card>
              <CardHeader><CardTitle>New Prediction</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <PredTypeToggle />
                <div className="space-y-2">
                  <Label>{predType === "stock" ? "Search Stock (NSE/BSE)" : "Search Cryptocurrency"}</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder={predType === "stock" ? "e.g. RELIANCE, TCS, INFY..." : "e.g. BTC, ETH, ADA..."}
                      value={searchQuery}
                      onChange={e => { setSearchQuery(e.target.value); setSymbol(""); }}
                      className="pl-10" autoComplete="off"
                    />
                  </div>
                  {searchQuery.length > 1 && (
                    <div className="relative">
                      {isSearching ? (
                        <div className="border rounded-md p-3 bg-white shadow text-sm text-gray-500 flex items-center gap-2">
                          <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />Searching...
                        </div>
                      ) : searchResults.length > 0 ? (
                        <div className="absolute top-1 left-0 right-0 z-50 max-h-64 overflow-y-auto border rounded-md bg-white shadow-lg">
                          {searchResults.map((r: any) => (
                            <button key={r.symbol}
                              onClick={() => { setSymbol(r.symbol); setSearchQuery(r.symbol); setSearchResults([]); setSearchAttempted(false); }}
                              className="w-full px-4 py-3 text-left hover:bg-gray-50 flex justify-between items-center border-b last:border-b-0 text-sm">
                              <div><p className="font-medium">{r.symbol}</p><p className="text-gray-500 text-xs">{r.companyName || r.name}</p></div>
                              {r.lastPrice > 0 && <p className="font-medium">₹{r.lastPrice?.toFixed(2)}</p>}
                            </button>
                          ))}
                        </div>
                      ) : searchAttempted ? (
                        <div className="border rounded-md p-3 bg-white shadow text-sm text-gray-500 space-y-2">
                          <p>No results for "<strong>{searchQuery}</strong>"</p>
                          <Button size="sm" variant="outline" className="w-full text-xs"
                            onClick={() => { const s = searchQuery.trim().toUpperCase(); setSymbol(s); setSearchQuery(s); setSearchResults([]); setSearchAttempted(false); }}>
                            Use "{searchQuery.toUpperCase()}" directly anyway
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  )}
                  {symbol && <p className="text-xs text-green-600 font-medium">✅ Selected: {symbol}</p>}
                </div>

                <div className="space-y-2">
                  <Label>Prediction Horizon</Label>
                  <Select value={horizon} onValueChange={(val) => { setHorizon(val); setPredResult(null); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1d">1 Day</SelectItem>
                      <SelectItem value="1w">1 Week</SelectItem>
                      <SelectItem value="1m">1 Month</SelectItem>
                      <SelectItem value="3m">3 Months</SelectItem>
                      <SelectItem value="6m">6 Months</SelectItem>
                      <SelectItem value="1y">1 Year</SelectItem>
                      <SelectItem value="custom">Custom Date</SelectItem>
                    </SelectContent>
                  </Select>
                  {horizon === "custom" && (
                    <Input type="datetime-local" value={targetDate} onChange={e => { setTargetDate(e.target.value); setPredResult(null); }} min={new Date().toISOString().slice(0, 16)} />
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Prediction Mode</Label>
                  <Select value={mode} onValueChange={(val) => { setMode(val); setPredResult(null); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="suggestion">AI + Astro Suggestion</SelectItem>
                      <SelectItem value="auto">Auto-Trading Signal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Risk Level</Label>
                  <Select value={riskLevel} onValueChange={(val) => { setRiskLevel(val); setPredResult(null); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Conservative (Low Risk)</SelectItem>
                      <SelectItem value="medium">Balanced (Medium Risk)</SelectItem>
                      <SelectItem value="high">Aggressive (High Risk)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button className="w-full" onClick={() => predictMutation.mutate()} disabled={!symbol || predictMutation.isPending}>
                  {predictMutation.isPending ? "Generating prediction..." :
                    `Predict ${symbol || "..."} for ${getHorizonText()}`}
                </Button>
              </CardContent>
            </Card>

            {/* ── Result Panel ── */}
            {predResult ? (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-xl">
                        {predResult.stock || predResult.crypto || predResult.cryptoSymbol}
                        {predResult.companyName && (
                          <span className="ml-2 text-sm font-normal text-gray-500">{predResult.companyName}</span>
                        )}
                      </CardTitle>
                      {predResult.exchange && (
                        <p className="text-xs text-gray-400 mt-0.5">{predResult.exchange} · {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                      )}
                    </div>
                    {predResult.confidence && (
                      <Badge className={getConfidenceColor(predResult.confidence)}>
                        {predResult.confidence?.toFixed(1)}% confidence
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {predResult.isBilling || predResult.paymentRequired ? (
                    <div className="space-y-3">
                      <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg text-center">
                        <p className="font-semibold text-orange-900">Subscription Created</p>
                        <p className="text-2xl font-bold text-orange-600 mt-1">₹{predResult.billing?.finalBill}</p>
                      </div>
                      <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white">Get Prediction →</Button>
                    </div>
                  ) : (() => {
                    const metrics = getPredictionMetrics(predResult);
                    const wKey = getWatchlistKey(predResult);
                    const isAdded = addedToWatchlist.has(wKey);
                    const isAdding = addingToWatchlist === wKey;

                    return (
                      <>
                        {/* ── Data quality notice ── */}
                       {!predResult.livePriceAvailable && (
                          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                            <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                            <p>Live market data unavailable — prices are model-based estimates. Verify on NSE/BSE before trading.</p>
                          </div>
                        )}

                        {/* ── Price targets ── */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-gray-50 rounded-lg p-3 text-center">
                            <p className="text-xs text-gray-500 mb-1">Current Price</p>
                            <p className="font-bold text-gray-900 text-lg">₹{predResult.currentPrice?.toFixed(2)}</p>
                          </div>
                          <div className="bg-red-50 rounded-lg p-3 text-center">
                            <p className="text-xs text-gray-500 mb-1">Target Low</p>
                            <p className="font-bold text-red-600 text-lg">₹{predResult.predLow?.toFixed(2)}</p>
                            {metrics && <p className="text-xs text-red-400 mt-0.5">-{metrics.downside}%</p>}
                          </div>
                          <div className="bg-green-50 rounded-lg p-3 text-center">
                            <p className="text-xs text-gray-500 mb-1">Target High</p>
                            <p className="font-bold text-green-600 text-lg">₹{predResult.predHigh?.toFixed(2)}</p>
                            {metrics && <p className="text-xs text-green-500 mt-0.5">+{metrics.upside}%</p>}
                          </div>
                        </div>

                        {/* ── Key metrics row ── */}
                        {metrics && (
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="bg-blue-50 rounded-lg p-2.5">
                              <p className="text-xs text-gray-500">Price Range</p>
                              <p className="font-semibold text-blue-700 text-sm">₹{metrics.range}</p>
                            </div>
                            <div className="bg-purple-50 rounded-lg p-2.5">
                              <p className="text-xs text-gray-500">Mid Target</p>
                              <p className="font-semibold text-purple-700 text-sm">₹{metrics.mid}</p>
                            </div>
                            <div className={`rounded-lg p-2.5 ${predResult.direction === "bearish" ? "bg-red-50" : "bg-green-50"}`}>
                              <p className="text-xs text-gray-500">Expected Move</p>
                              <p className={`font-semibold text-sm ${predResult.direction === "bearish" ? "text-red-700" : "text-green-700"}`}>
                                {predResult.direction === "bearish" ? "-" : "+"}{predResult.direction === "bearish" ? metrics.downside : metrics.upside}%
                              </p>
                            </div>
                          </div>
                        )}

                        <LongTermStatsCard stats={predResult.longTermStats} />
                        <VedicInsightsCard vedic={predResult.vedic} />

                        {/* ── AI Conclusion: Groq studied the statistics + astrology, using weights learned from past results ── */}
                        {predResult.aiConclusion && (
                          <div className="p-4 bg-white border border-purple-300 rounded-lg space-y-2" data-testid="card-ai-conclusion">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <p className="text-sm font-semibold text-gray-900">AI Conclusion</p>
                              <div className="flex flex-wrap gap-1.5">
                                <Badge variant="outline" className="text-xs capitalize">
                                  Stats &amp; astrology: {predResult.aiConclusion.agreement}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {predResult.aiConclusion.weighting?.statistical}% stats / {predResult.aiConclusion.weighting?.astrological}% astrology
                                </Badge>
                                <Badge variant="outline" className="text-xs" data-testid="badge-learning">
                                  {predResult.learning?.hasData
                                    ? `Weights learned from ${predResult.learning.outcomes} past outcomes`
                                    : "Not enough past outcomes to learn weights yet"}
                                </Badge>
                              </div>
                            </div>
                            <p className="text-sm text-gray-700" data-testid="text-ai-conclusion">{predResult.aiConclusion.summary}</p>
                            {predResult.aiConclusion.keyDrivers?.length > 0 && (
                              <ul className="text-xs text-gray-600 list-disc pl-5 space-y-0.5">
                                {predResult.aiConclusion.keyDrivers.map((d: string, i: number) => <li key={i}>{d}</li>)}
                              </ul>
                            )}
                            {predResult.aiConclusion.recommendation && (
                              <p className="text-xs font-medium text-purple-800">Suggested approach: {predResult.aiConclusion.recommendation}</p>
                            )}
                          </div>
                        )}

                        {/* ── Direction & Signal ── */}
                        <div className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50">
                          <div className="flex items-center gap-2">
                            {predResult.direction === "bullish"
                              ? <><ArrowUpRight className="h-5 w-5 text-green-600" /><span className="font-semibold text-green-700 capitalize">Bullish Signal</span></>
                              : predResult.direction === "bearish"
                              ? <><ArrowDownRight className="h-5 w-5 text-red-600" /><span className="font-semibold text-red-700 capitalize">Bearish Signal</span></>
                              : <><Minus className="h-5 w-5 text-gray-500" /><span className="font-semibold text-gray-600">Neutral / Consolidating</span></>}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <Activity className="h-3.5 w-3.5" />
                            {predResult.marketSentiment || "Mixed"}
                          </div>
                        </div>

                        {/* ── Technical Factors ── */}
                        {predResult.technicalFactors && predResult.technicalFactors.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
                              <BarChart2 className="h-3.5 w-3.5" />Technical Factors
                            </p>
                            <div className="space-y-1.5">
                              {predResult.technicalFactors.slice(0, 4).map((f: string, i: number) => (
                                <div key={i} className="flex items-start gap-2 text-xs text-gray-600 bg-white border border-gray-100 rounded px-2.5 py-1.5">
                                  <span className="text-blue-400 font-bold mt-0.5">→</span>{f}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* ── Key Risks ── */}
                        {predResult.keyRisks && predResult.keyRisks.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
                              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />Key Risks
                            </p>
                            <div className="space-y-1.5">
                              {predResult.keyRisks.slice(0, 3).map((r: string, i: number) => (
                                <div key={i} className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2.5 py-1.5">
                                  <span className="font-bold mt-0.5">⚠</span>{r}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* ── AI Reasoning ── */}
                        {predResult.reasoning && predResult.aiPowered && (
                          <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
                              <Info className="h-3.5 w-3.5 text-blue-500" />AI Analysis
                            </p>
                            <p className="text-xs text-gray-600 bg-blue-50 border border-blue-100 rounded px-3 py-2 leading-relaxed">
                              {predResult.reasoning}
                            </p>
                          </div>
                        )}

                        {/* ── Watchlist button ── */}
                        <Button
                          variant={isAdded ? "default" : "outline"}
                          className={`w-full gap-2 ${isAdded ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
                          onClick={() => addToWatchlistMutation.mutate(wKey)}
                          disabled={isAdding || isAdded}
                        >
                          {isAdding
                            ? <><div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />Adding...</>
                            : isAdded
                            ? <><BookmarkCheck className="h-4 w-4" />Added to Watchlist</>
                            : <><BookmarkPlus className="h-4 w-4" />Add to Watchlist</>}
                        </Button>
                      </>
                    );
                  })()}
                </CardContent>
              </Card>
            ) : (
              <Card className="flex flex-col items-center justify-center p-12 text-center text-gray-400 border-dashed">
                <Zap className="h-12 w-12 text-gray-300 mb-3" />
                <p className="text-sm font-medium">Your prediction result will appear here</p>
                <p className="text-xs mt-1">Select a symbol and click Generate</p>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="active" className="mt-6">
          {(activePredictions as any[])?.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(activePredictions as any[]).map((p: any) => <PredictionCard key={p.id} prediction={p} />)}
            </div>
          ) : (
            <Card className="p-12 text-center">
              <div className="space-y-4">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto"><Clock className="h-8 w-8 text-primary" /></div>
                <h3 className="text-lg font-semibold">No Active Predictions</h3>
                <p className="text-gray-600">Go to Make Prediction tab to create your first prediction.</p>
                <Button onClick={() => setActiveTab("make")}>Make a Prediction</Button>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="past" className="mt-6">
          {pastPredictions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pastPredictions.map((p: any) => <PredictionCard key={p.id} prediction={p} isPast />)}
            </div>
          ) : (
            <Card className="p-12 text-center">
              <div className="space-y-4">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto"><Calendar className="h-8 w-8 text-gray-400" /></div>
                <h3 className="text-lg font-semibold">No Past Predictions</h3>
                <p className="text-gray-600">Completed predictions will appear here.</p>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <FeedbackForm />
    </div>
  );
}
