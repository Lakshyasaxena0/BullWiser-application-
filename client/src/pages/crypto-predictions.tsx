import VedicInsightsCard from "@/components/VedicInsightsCard";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Bitcoin, Search, Clock, Target, Eye, ChevronLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function CryptoPredictions() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [cryptoSymbol, setCryptoSymbol] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [predictionTime, setPredictionTime] = useState('');
  const [mode, setMode] = useState('suggestion');
  const [riskLevel, setRiskLevel] = useState('high'); // Crypto is high risk by default
  const [predictionResult, setPredictionResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("predict");
  const [addingToWatchlist, setAddingToWatchlist] = useState(false);
  const queryClient = useQueryClient();

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
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
  }, [isAuthenticated, isLoading, toast]);

  // Search cryptos
  const { data: searchResults, isLoading: searchLoading } = useQuery<any[]>({
    queryKey: ["/api/search/crypto", searchQuery],
    enabled: searchQuery.length > 1,
    staleTime: 30000, // 30 seconds
  });

  // Get crypto overview
  const { data: cryptoOverview } = useQuery<any>({
    queryKey: ["/api/crypto/overview"],
    staleTime: 60000, // 1 minute
  });

  // Get crypto predictions
  const { data: cryptoPredictions } = useQuery<any[]>({
    queryKey: ["/api/user/predictions"],
    enabled: isAuthenticated,
  });

  // Crypto prediction mutation
  const predictMutation = useMutation({
    // apiRequest resolves to the raw fetch Response — it has to be parsed, otherwise
    // `data.crypto` / `data.confidence` below are undefined and the result card never fills in.
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/crypto/predict", data);
      return await res.json();
    },
    onSuccess: (data) => {
      setPredictionResult(data);
      toast({
        title: "Prediction Generated!",
        description: `${data.crypto} prediction completed with ${data.confidence}% confidence`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/predictions"] });
    },
    onError: (error: any) => {
      toast({
        title: "Prediction Failed",
        description: error.message || "Failed to generate crypto prediction",
        variant: "destructive",
      });
    },
  });

  // Add to watchlist mutation
  const watchlistMutation = useMutation({
    mutationFn: (crypto: string) => {
      setAddingToWatchlist(true);
      return apiRequest('POST', '/api/user/watchlist', { stock: `CRYPTO_${crypto}` });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Cryptocurrency added to watchlist successfully!",
      });
      setAddingToWatchlist(false);
      queryClient.invalidateQueries({ queryKey: ["/api/user/watchlist"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add cryptocurrency to watchlist",
        variant: "destructive",
      });
      setAddingToWatchlist(false);
    },
  });

  const handleGeneratePrediction = () => {
    predictMutation.mutate({
      crypto: cryptoSymbol,
      when: predictionTime || 'now',
      mode,
      riskLevel
    });
  };

  const handleAddToWatchlist = () => {
    if (predictionResult) {
      watchlistMutation.mutate(predictionResult.crypto);
    }
  };

  const handleSearchSelect = (crypto: any) => {
    setCryptoSymbol(crypto.symbol);
    setSearchQuery(crypto.symbol);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Filter crypto predictions from all predictions
  const activeCryptoPredictions = cryptoPredictions?.filter((p: any) => 
    p.stock.startsWith('CRYPTO_')
  ) || [];

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 70) return "bg-green-100 text-green-800";
    if (confidence >= 50) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  const getDirectionIcon = (direction: string) => {
    switch (direction) {
      case 'bullish': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'bearish': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Target className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation('/')}
            className="flex items-center"
            data-testid="button-back"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Dashboard
          </Button>
          <div className="border-l pl-4">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center" data-testid="text-page-title">
              <Bitcoin className="h-6 w-6 mr-2 text-orange-500" />
              Crypto Predictions
            </h1>
            <p className="text-gray-600" data-testid="text-page-description">
              AI-powered cryptocurrency price predictions with market analysis
            </p>
          </div>
        </div>
        <Button
          onClick={() => setLocation('/crypto-plans')}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Bitcoin className="h-4 w-4 mr-1" />
          Crypto Plans
        </Button>
      </div>

      {/* Crypto Market Overview */}
      {cryptoOverview && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Market Cap</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                ${(cryptoOverview.totalMarketCap / 1e12).toFixed(2)}T
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">24h Volume</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                ${(cryptoOverview.totalVolume / 1e9).toFixed(0)}B
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Market Change</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${cryptoOverview.marketCapChange24h > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {cryptoOverview.marketCapChange24h > 0 ? '+' : ''}{cryptoOverview.marketCapChange24h.toFixed(2)}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Active Predictions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {activeCryptoPredictions.length}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="predict" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="predict" data-testid="tab-predict">
            Generate Prediction
          </TabsTrigger>
          <TabsTrigger value="active" data-testid="tab-active">
            Active Predictions ({activeCryptoPredictions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="predict" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Prediction Form */}
            <Card>
              <CardHeader>
                <CardTitle data-testid="text-prediction-form-title">Crypto Prediction</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="searchCrypto">Search Cryptocurrency</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      id="searchCrypto"
                      type="text"
                      placeholder="Search crypto (e.g., BTC, ETH, ADA)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                      data-testid="input-crypto-search"
                    />
                  </div>

                  {/* Search Results */}
                  {searchResults && searchResults.length > 0 && (
                    <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded-md bg-white">
                      {searchResults.map((crypto: any) => (
                        <button
                          key={crypto.symbol}
                          onClick={() => handleSearchSelect(crypto)}
                          className="w-full px-3 py-2 text-left hover:bg-gray-50 flex justify-between items-center border-b border-gray-100 last:border-b-0"
                          data-testid={`search-result-${crypto.symbol}`}
                        >
                          <div>
                            <span className="font-medium">{crypto.symbol}</span>
                            <span className="text-sm text-gray-600 ml-2">{crypto.name}</span>
                          </div>
                          <span className="text-sm font-medium">
                            ${crypto.lastPrice.toLocaleString()}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Selected Crypto Display */}
                  {cryptoSymbol && cryptoSymbol !== searchQuery && (
                    <div className="mt-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md">
                      <span className="text-sm text-blue-700">Selected: <strong>{cryptoSymbol}</strong></span>
                    </div>
                  )}
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

                <div className="space-y-2">
                  <Label htmlFor="mode">Prediction Mode</Label>
                  <Select value={mode} onValueChange={setMode}>
                    <SelectTrigger data-testid="select-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="suggestion">AI + Astro Suggestion</SelectItem>
                      <SelectItem value="auto">Auto-Trading Signal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="riskLevel">Risk Level</Label>
                  <Select value={riskLevel} onValueChange={setRiskLevel}>
                    <SelectTrigger data-testid="select-risk">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="medium">Medium Risk</SelectItem>
                      <SelectItem value="high">High Risk</SelectItem>
                      <SelectItem value="extreme">Extreme Risk</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button 
                  onClick={handleGeneratePrediction}
                  disabled={!cryptoSymbol || predictMutation.isPending}
                  className="w-full"
                  data-testid="button-generate-prediction"
                >
                  {predictMutation.isPending ? "Generating..." : "Get Crypto Prediction"}
                </Button>
              </CardContent>
            </Card>

            {/* Prediction Result */}
            {predictionResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span data-testid="text-result-title">
                      {predictionResult.crypto} Prediction
                    </span>
                    <div className="flex items-center space-x-2">
                      {getDirectionIcon(predictionResult.direction)}
                      <Badge className={getConfidenceColor(predictionResult.confidence)}>
                        {predictionResult.confidence}% confidence
                      </Badge>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-sm text-gray-500">Current Price</p>
                      <p className="text-lg font-bold">${predictionResult.currentPrice}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-500">Target Low</p>
                      <p className="text-lg font-bold text-red-600">${predictionResult.predLow}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-500">Target High</p>
                      <p className="text-lg font-bold text-green-600">${predictionResult.predHigh}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Direction:</span>
                      <Badge variant={predictionResult.direction === 'bullish' ? 'default' : 
                                   predictionResult.direction === 'bearish' ? 'destructive' : 'secondary'}>
                        {predictionResult.direction}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Market Cap:</span>
                      <span className="text-sm font-medium">${(predictionResult.marketCap / 1e9).toFixed(2)}B</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">24h Change:</span>
                      <span className={`text-sm font-medium ${predictionResult.change24h > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {predictionResult.change24h > 0 ? '+' : ''}{predictionResult.change24h.toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-gray-50 rounded-md">
                    <p className="text-sm text-gray-700">
                      <strong>Recommendation:</strong> {predictionResult.recommendation}
                    </p>
                  </div>

                  <VedicInsightsCard vedic={predictionResult.vedic} />
                  {predictionResult.aiConclusion && (
                    <div className="p-3 bg-white border border-purple-300 rounded-md" data-testid="card-ai-conclusion">
                      <p className="text-sm font-semibold text-gray-800 mb-1">
                        AI Conclusion
                        <span className="ml-2 text-xs font-normal text-gray-500 capitalize">
                          (stats & astrology: {predictionResult.aiConclusion.agreement}, {predictionResult.aiConclusion.weighting?.statistical}% / {predictionResult.aiConclusion.weighting?.astrological}%)
                        </span>
                        <span className="ml-2 text-xs font-normal text-gray-400">
                          {predictionResult.learning?.hasData
                            ? `· weights learned from ${predictionResult.learning.outcomes} past outcomes`
                            : '· not enough past outcomes to learn weights yet'}
                        </span>
                      </p>
                      <p className="text-sm text-gray-700">{predictionResult.aiConclusion.summary}</p>
                      <p className="mt-2 text-xs text-gray-500">AI-generated analysis for information only — not financial advice.</p>
                    </div>
                  )}

                  <div className="flex space-x-2">
                    <Button 
                      onClick={handleAddToWatchlist}
                      disabled={addingToWatchlist}
                      variant="outline"
                      className="flex-1"
                      data-testid="button-add-watchlist"
                    >
                      {addingToWatchlist ? "Adding..." : "Add to Watchlist"}
                    </Button>
                    <Button className="flex-1" data-testid="button-set-alert">
                      Set Price Alert
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="active" className="mt-6">
          {activeCryptoPredictions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeCryptoPredictions.map((prediction: any) => {
                const cryptoSymbol = prediction.stock.replace('CRYPTO_', '');
                const midPrice = (prediction.predLow + prediction.predHigh) / 2;
                const isUptrend = midPrice > prediction.currentPrice;

                return (
                  <Card key={prediction.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg font-semibold flex items-center">
                          <Bitcoin className="h-4 w-4 mr-1 text-orange-500" />
                          {cryptoSymbol}
                        </CardTitle>
                        <div className="flex items-center space-x-2">
                          {isUptrend ? (
                            <TrendingUp className="h-4 w-4 text-green-500" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-red-500" />
                          )}
                          <Badge className={getConfidenceColor(prediction.confidence)}>
                            {prediction.confidence}%
                          </Badge>
                        </div>
                      </div>
                      <Badge variant="outline" className="w-fit">
                        {prediction.mode}
                      </Badge>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div className="text-center">
                          <p className="text-gray-500">Current</p>
                          <p className="font-semibold">${prediction.currentPrice}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-gray-500">Low</p>
                          <p className="font-semibold text-red-600">${prediction.predLow}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-gray-500">High</p>
                          <p className="font-semibold text-green-600">${prediction.predHigh}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-sm text-gray-500">
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 mr-1" />
                          <span>{new Date(prediction.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <Button size="sm" variant="outline" className="w-full">
                        <Eye className="h-4 w-4 mr-1" />
                        View Details
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="p-12 text-center">
              <div className="space-y-4">
                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
                  <Bitcoin className="h-8 w-8 text-orange-500" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">No Active Crypto Predictions</h3>
                <p className="text-gray-600">
                  Generate cryptocurrency predictions to start tracking their performance.
                </p>
                <Button onClick={() => setActiveTab("predict")}>
                  Create Crypto Prediction
                </Button>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
