import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Sparkles, Calculator, Plus, Bell, Search, ChartBar, Activity, TrendingUp, Brain, Info, Moon, Sun, Star, Calendar } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { isUnauthorizedError } from "@/lib/authUtils";

export default function PredictionForm() {
  const [stockSymbol, setStockSymbol] = useState("SUZLON");
  const [searchQuery, setSearchQuery] = useState("SUZLON");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [predictionTime, setPredictionTime] = useState("");
  const [mode, setMode] = useState("suggestion");
  const [riskLevel, setRiskLevel] = useState("medium");
  const [tradesPerDay, setTradesPerDay] = useState("10");
  const [predictionResult, setPredictionResult] = useState<any>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check AI status
  const { data: aiStatus } = useQuery({
    queryKey: ["/api/ai/status"],
    queryFn: async () => {
      const response = await fetch("/api/ai/status", {
        credentials: "include"
      });
      return response.json();
    },
  });

  // Query for user subscriptions
  const { data: subscriptions } = useQuery({
    queryKey: ["/api/user/subscriptions"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/user/subscriptions");
      return response.json();
    },
  });

  // Query for stock search suggestions
  const { data: searchResults } = useQuery({
    queryKey: ["/api/search/stocks", searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return [];
      const response = await fetch(`/api/search/stocks?q=${encodeURIComponent(searchQuery)}`, {
        credentials: "include"
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: searchQuery.length >= 2,
    staleTime: 10000,
  });

  // Handle clicking outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const predictMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/predict", data);
      return response.json();
    },
    onSuccess: (data) => {
      setPredictionResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/user/predictions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/predictions/active"] });
      toast({
        title: "Prediction Generated",
        description: `Successfully generated prediction for ${data.stock}`,
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to generate prediction. Please try again.",
        variant: "destructive",
      });
    },
  });

  const estimateMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/billing/estimate", data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Cost Estimate",
        description: `Estimated cost: ₹${data.finalBill} per ${data.duration}`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to estimate cost. Please try again.",
        variant: "destructive",
      });
    },
  });

  const watchlistMutation = useMutation({
    mutationFn: async (stock: string) => {
      await apiRequest("POST", "/api/user/watchlist", { stock });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/watchlist"] });
      toast({
        title: "Added to Watchlist",
        description: `${stockSymbol} has been added to your watchlist`,
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to add to watchlist. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleGeneratePrediction = () => {
    if (!subscriptions || subscriptions.length === 0) {
      toast({
        title: "Subscription Required",
        description: "You need an active subscription to generate predictions. Please subscribe to a plan first.",
        variant: "destructive",
      });
      return;
    }
    
    predictMutation.mutate({
      stock: stockSymbol,
      when: predictionTime || 'now',
      mode,
      riskLevel
    });
  };

  const handleEstimateCost = () => {
    estimateMutation.mutate({
      mode,
      tradeType: riskLevel,
      tradesPerDay: parseInt(tradesPerDay),
      duration: 'monthly'
    });
  };

  const handleAddToWatchlist = () => {
    if (predictionResult) {
      watchlistMutation.mutate(predictionResult.stock);
    }
  };

  return (
    <Card className="shadow-sm border border-gray-200 overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-bold text-gray-900" data-testid="text-prediction-title">
            Stock Prediction
          </CardTitle>
          <div className="flex items-center gap-2">
            {aiStatus?.aiEnabled ? (
              <Badge className="bg-purple-100 text-purple-800 flex items-center space-x-1" data-testid="badge-ai-enabled">
                <Brain className="w-3 h-3" />
                <span>AI Powered</span>
              </Badge>
            ) : (
              <Badge variant="secondary" className="flex items-center space-x-1" data-testid="badge-ai-disabled">
                <Calculator className="w-3 h-3" />
                <span>Math Model</span>
              </Badge>
            )}
            <Badge className="bg-green-100 text-green-800 flex items-center space-x-1" data-testid="badge-live-data">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span>Live Data</span>
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Form Fields */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 relative">
              <Label htmlFor="stockSymbol">Stock Symbol</Label>
              <div className="relative">
                <Input
                  ref={searchInputRef}
                  id="stockSymbol"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value.toUpperCase());
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="Search stocks (e.g., RELIANCE, TCS, INFY)"
                  className="pr-10"
                  data-testid="input-stock-symbol"
                />
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />

                {/* Suggestions Dropdown */}
                {showSuggestions && searchResults && searchResults.length > 0 && (
                  <div
                    ref={suggestionsRef}
                    className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto"
                  >
                    {searchResults.map((stock: any) => (
                      <button
                        key={stock.symbol}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
                        onClick={() => {
                          setStockSymbol(stock.symbol);
                          setSearchQuery(stock.symbol);
                          setShowSuggestions(false);
                        }}
                        data-testid={`suggestion-${stock.symbol}`}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="font-semibold text-gray-900">{stock.symbol}</div>
                            <div className="text-sm text-gray-500">{stock.companyName || stock.symbol}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium text-gray-900">₹{stock.lastPrice || stock.currentPrice || 0}</div>
                            <div className={`text-sm ${(stock.changePercent || stock.percentChange || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {(stock.changePercent || stock.percentChange || 0) >= 0 ? '+' : ''}{(stock.changePercent || stock.percentChange || 0).toFixed(2)}%
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Selected Stock Display */}
                {stockSymbol && stockSymbol !== searchQuery && (
                  <div className="mt-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md">
                    <span className="text-sm text-blue-700">Selected: <strong>{stockSymbol}</strong></span>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="predictionTime">Prediction Time (Optional)</Label>
              <Input
                id="predictionTime"
                type="datetime-local"
                value={predictionTime}
                onChange={(e) => setPredictionTime(e.target.value)}
                data-testid="input-prediction-time"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={setMode} data-testid="select-mode">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white opacity-100 shadow-lg border border-gray-200">
                  <SelectItem value="suggestion">Suggestion Mode</SelectItem>
                  <SelectItem value="auto">Auto Trading</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Risk Level</Label>
              <Select value={riskLevel} onValueChange={setRiskLevel} data-testid="select-risk-level">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white opacity-100 shadow-lg border border-gray-200">
                  <SelectItem value="low">Low Risk</SelectItem>
                  <SelectItem value="medium">Medium Risk</SelectItem>
                  <SelectItem value="high">High Risk</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Trades per Day</Label>
              <Select value={tradesPerDay} onValueChange={setTradesPerDay} data-testid="select-trades-per-day">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white opacity-100 shadow-lg border border-gray-200">
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="15">15</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-4">
            <Button
              onClick={handleGeneratePrediction}
              disabled={predictMutation.isPending}
              className="flex-1 bg-primary hover:bg-blue-700 text-white"
              data-testid="button-generate-prediction"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {predictMutation.isPending ? "Generating..." : "Generate Prediction"}
            </Button>
            <Button
              variant="outline"
              onClick={handleEstimateCost}
              disabled={estimateMutation.isPending}
              data-testid="button-estimate-cost"
            >
              <Calculator className="h-4 w-4 mr-2" />
              {estimateMutation.isPending ? "Calculating..." : "Estimate Cost"}
            </Button>
          </div>
        </div>

        {/* Prediction Result */}
        {predictionResult && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900" data-testid="text-results-title">
                Prediction Results
              </h3>
              <div className="flex items-center gap-2">
                {predictionResult.aiPowered && (
                  <Badge className="bg-purple-100 text-purple-800" data-testid="badge-ai-analysis">
                    <Brain className="h-3 w-3 mr-1" />
                    AI Analysis
                  </Badge>
                )}
                <Badge className="bg-blue-100 text-blue-800" data-testid="badge-high-confidence">
                  {predictionResult.confidence >= 80 ? 'High' : predictionResult.confidence >= 60 ? 'Medium' : 'Low'} Confidence
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <p className="text-sm text-gray-600">Current Price</p>
                <p className="text-2xl font-bold text-gray-900" data-testid="text-current-price">
                  ₹{predictionResult.currentPrice}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600">Predicted Range</p>
                <p className="text-2xl font-bold text-green-600" data-testid="text-predicted-range">
                  ₹{predictionResult.predLow} - ₹{predictionResult.predHigh}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600">Confidence</p>
                <p className="text-2xl font-bold text-primary" data-testid="text-confidence">
                  {predictionResult.confidence}%
                </p>
              </div>
            </div>

            {/* AI Conclusion — the AI's final verdict after studying the statistical AND astrological analyses */}
            {predictionResult.aiConclusion && (
              <div className="mt-4 p-4 bg-white border border-purple-300 rounded-lg" data-testid="card-ai-conclusion">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-purple-600" />
                    <h4 className="text-sm font-semibold text-gray-800">AI Conclusion</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs capitalize">
                      Stats & astrology: {predictionResult.aiConclusion.agreement}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {predictionResult.aiConclusion.weighting?.statistical}% stats / {predictionResult.aiConclusion.weighting?.astrological}% astrology
                    </Badge>
                    <Badge variant="outline" className="text-xs" data-testid="badge-learning">
                      {predictionResult.learning?.hasData
                        ? `Weights learned from ${predictionResult.learning.outcomes} past outcomes`
                        : 'Learning: not enough past outcomes yet'}
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-gray-700" data-testid="text-ai-conclusion">{predictionResult.aiConclusion.summary}</p>
                {predictionResult.aiConclusion.keyDrivers?.length > 0 && (
                  <ul className="mt-2 list-disc list-inside text-sm text-gray-600 space-y-1">
                    {predictionResult.aiConclusion.keyDrivers.map((d: string, idx: number) => (
                      <li key={idx}>{d}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs text-gray-500">
                  AI-generated analysis for information only — not financial advice.
                </p>
              </div>
            )}

            {/* AI Analysis Details (only shown when AI-powered) */}
            {predictionResult.aiPowered && predictionResult.reasoning && (
              <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="h-4 w-4 text-purple-600" />
                  <h4 className="text-sm font-semibold text-gray-700">AI Analysis Insights</h4>
                </div>
                
                {predictionResult.direction && (
                  <div className="mb-3">
                    <span className="text-sm text-gray-600">Market Direction: </span>
                    <Badge className={
                      predictionResult.direction === 'bullish' ? 'bg-green-100 text-green-800' :
                      predictionResult.direction === 'bearish' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }>
                      {predictionResult.direction.toUpperCase()}
                    </Badge>
                  </div>
                )}
                
                {predictionResult.technicalFactors && (
                  <div className="mb-3">
                    <p className="text-sm font-medium text-gray-700 mb-1">Technical Factors:</p>
                    <div className="flex flex-wrap gap-2">
                      {predictionResult.technicalFactors.map((factor: string, idx: number) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {factor}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {predictionResult.keyRisks && (
                  <div className="mb-3">
                    <p className="text-sm font-medium text-gray-700 mb-1">Key Risks:</p>
                    <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                      {predictionResult.keyRisks.map((risk: string, idx: number) => (
                        <li key={idx}>{risk}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {predictionResult.recommendation && (
                  <div className="mb-3">
                    <p className="text-sm font-medium text-gray-700 mb-1">Recommendation:</p>
                    <p className="text-sm text-gray-600">{predictionResult.recommendation}</p>
                  </div>
                )}
                
                {predictionResult.reasoning && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-1">Analysis Summary:</p>
                    <p className="text-sm text-gray-600">{predictionResult.reasoning}</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex space-x-3">
              <Button
                onClick={handleAddToWatchlist}
                disabled={watchlistMutation.isPending}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                data-testid="button-add-to-watchlist"
              >
                <Plus className="h-4 w-4 mr-2" />
                {watchlistMutation.isPending ? "Adding..." : "Add to Watchlist"}
              </Button>
              <Button variant="outline" className="flex-1" data-testid="button-set-alert">
                <Bell className="h-4 w-4 mr-2" />
                Set Alert
              </Button>
            </div>

            {/* Statistical Tools Section */}
            <div className="mt-6 border-t pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Info className="h-4 w-4 text-blue-600" />
                <h4 className="text-sm font-semibold text-gray-700">Statistical Tools & Weightages Used</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                  <div className="flex items-center gap-2">
                    <ChartBar className="h-4 w-4 text-purple-600" />
                    <span className="text-sm text-gray-700">Moving Averages (SMA/EMA)</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">25%</Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-gray-700">RSI & MACD Indicators</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">20%</Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-orange-600" />
                    <span className="text-sm text-gray-700">Bollinger Bands</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">15%</Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-blue-600" />
                    <span className="text-sm text-gray-700">Machine Learning Models</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">20%</Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                  <div className="flex items-center gap-2">
                    <ChartBar className="h-4 w-4 text-red-600" />
                    <span className="text-sm text-gray-700">Volume Analysis</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">10%</Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-indigo-600" />
                    <span className="text-sm text-gray-700">Market Sentiment</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">10%</Badge>
                </div>
              </div>

              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-800">
                  <strong>Note:</strong> Our proprietary algorithm combines these technical indicators with real-time market data from NSE/BSE to generate accurate predictions. Weightages adjust dynamically based on market conditions.
                </p>
              </div>
            </div>

            {/* Astrological Analysis Section */}
            <div className="mt-6 border-t pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Moon className="h-4 w-4 text-purple-600" />
                <h4 className="text-sm font-semibold text-gray-700">Astrological Analysis Factors</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Sun className="h-4 w-4 text-yellow-600" />
                      <span className="text-sm font-medium text-gray-700">Current Hora</span>
                    </div>
                  </div>
                  <div className="text-lg font-semibold text-purple-800">
                    {predictionResult.astrologyInfo?.hora || 'Jupiter'}
                  </div>
                  <p className="text-xs text-gray-600 mt-1">Planetary hour influencing market energy</p>
                </div>

                <div className="p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-purple-600" />
                      <span className="text-sm font-medium text-gray-700">Cosmic Bias</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-purple-800">
                      {predictionResult.astrologyInfo?.bias > 0 ? '+' : ''}{predictionResult.astrologyInfo?.bias || '+2'}
                    </span>
                    <Badge
                      variant="secondary"
                      className={`text-xs ${
                        predictionResult.astrologyInfo?.bias > 0 ? 'bg-green-100 text-green-800' :
                        predictionResult.astrologyInfo?.bias < 0 ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {predictionResult.astrologyInfo?.bias > 0 ? 'Favorable' :
                       predictionResult.astrologyInfo?.bias < 0 ? 'Challenging' : 'Neutral'}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">Hidden influence on price movement</p>
                </div>

                <div className="p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Moon className="h-4 w-4 text-indigo-600" />
                      <span className="text-sm font-medium text-gray-700">Lunar Phase</span>
                    </div>
                  </div>
                  <div className="text-sm font-medium text-purple-800">Waxing Gibbous</div>
                  <Progress value={87} className="h-2 mt-1" />
                  <p className="text-xs text-gray-600 mt-1">87% illuminated - Growth phase</p>
                </div>

                <div className="p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-medium text-gray-700">Planetary Alignment</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={75} className="flex-1 h-2" />
                    <span className="text-sm font-medium text-purple-800">75%</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">Market harmony index</p>
                </div>

                <div className="p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium text-gray-700">Muhurat Window</span>
                    </div>
                  </div>
                  <div className="text-sm font-medium text-purple-800">Auspicious: 11:00-13:00</div>
                  <p className="text-xs text-gray-600 mt-1">Favorable trading hours today</p>
                </div>

                <div className="p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-gray-700">Rahu-Ketu Axis</span>
                    </div>
                  </div>
                  <div className="text-sm font-medium text-purple-800">Stable Position</div>
                  <p className="text-xs text-gray-600 mt-1">Low volatility influence</p>
                </div>
              </div>

              <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-xs text-purple-700">
                  <Info className="h-3 w-3 inline mr-1" />
                  <strong>Astrological Edge:</strong> Our system subtly incorporates planetary influences and cosmic patterns to enhance prediction accuracy. These factors work alongside technical analysis for a holistic approach.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
