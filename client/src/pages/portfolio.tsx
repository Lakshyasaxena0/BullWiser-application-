import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, Eye, X, BarChart2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function Portfolio() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = "/auth";
    }
  }, [isAuthenticated, isLoading]);

  const { data: watchlist = [], isLoading: watchlistLoading } = useQuery<any[]>({
    queryKey: ["/api/user/watchlist"],
    enabled: isAuthenticated,
  });

  const { data: activePredictions = [] } = useQuery<any[]>({
    queryKey: ["/api/user/predictions/active"],
    enabled: isAuthenticated,
  });

  const { data: allPredictions = [] } = useQuery<any[]>({
    queryKey: ["/api/user/predictions"],
    enabled: isAuthenticated,
  });

  const removeFromWatchlist = useMutation({
    mutationFn: (stock: string) => apiRequest("DELETE", `/api/user/watchlist/${stock}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/watchlist"] });
      toast({ title: "Removed from watchlist" });
    },
    onError: () => toast({ title: "Failed to remove", variant: "destructive" }),
  });

  // ── Real performance stats from actual predictions ────────────────────────
  const totalPredictions = allPredictions.length;

  // Calculate accuracy: predictions where current price is within pred range
  const completedPreds = allPredictions.filter((p: any) => p.currentPrice && p.predLow && p.predHigh);
  const accuratePreds = completedPreds.filter((p: any) =>
    p.currentPrice >= p.predLow && p.currentPrice <= p.predHigh
  );
  const accuracyRate = completedPreds.length > 0
    ? ((accuratePreds.length / completedPreds.length) * 100).toFixed(1)
    : null;

  // Best/worst from predictions
  const predsByStock = allPredictions.reduce((acc: any, p: any) => {
    if (!p.stock || p.stock.startsWith('CRYPTO_')) return acc;
    if (!acc[p.stock]) acc[p.stock] = [];
    acc[p.stock].push(p);
    return acc;
  }, {});

  const stockSymbols = Object.keys(predsByStock);

  if (isLoading || watchlistLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Portfolio</h1>
        <p className="text-gray-600">Manage your watchlist and track your investment portfolio</p>
      </div>

      <Tabs defaultValue="watchlist" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
          <TabsTrigger value="active">Active Predictions</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        {/* ── Watchlist ── */}
        <TabsContent value="watchlist" className="space-y-4">
          {watchlist.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {watchlist.map((item: any) => (
                <Card key={item.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg font-semibold">{item.stock}</CardTitle>
                      <Button size="sm" variant="ghost" onClick={() => removeFromWatchlist.mutate(item.stock)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-sm text-gray-500">
                      Added {new Date(item.createdAt).toLocaleDateString('en-IN')}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex space-x-2">
                      <Button size="sm" variant="outline" className="flex-1"
                        onClick={() => window.location.href = `/predictions`}>
                        <TrendingUp className="h-4 w-4 mr-1" />Predict
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-12 text-center">
              <div className="space-y-4">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                  <Eye className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Your Watchlist is Empty</h3>
                <p className="text-gray-600">Add stocks from the Predictions page to track them here.</p>
                <Button onClick={() => window.location.href = '/predictions'}>Go to Predictions</Button>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ── Active Predictions ── */}
        <TabsContent value="active" className="space-y-4">
          {activePredictions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activePredictions.map((p: any) => {
                const isCrypto = p.stock?.startsWith('CRYPTO_');
                const symbol = isCrypto ? p.stock.replace('CRYPTO_', '') : p.stock;
                return (
                  <Card key={p.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg font-semibold">{symbol}</CardTitle>
                        <Badge className="bg-green-100 text-green-800">Active</Badge>
                      </div>
                      {isCrypto && <Badge variant="outline" className="text-xs w-fit">Crypto</Badge>}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div className="text-center">
                          <p className="text-gray-500">Current</p>
                          <p className="font-semibold">₹{Number(p.currentPrice).toFixed(2)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-gray-500">Low</p>
                          <p className="font-semibold text-red-600">₹{Number(p.predLow).toFixed(2)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-gray-500">High</p>
                          <p className="font-semibold text-green-600">₹{Number(p.predHigh).toFixed(2)}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <Badge className="bg-blue-100 text-blue-800">{Number(p.confidence).toFixed(1)}% confidence</Badge>
                        <span className="text-xs text-gray-400">
                          {new Date(p.createdAt).toLocaleDateString('en-IN')}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="p-12 text-center">
              <div className="space-y-4">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                  <TrendingUp className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">No Active Predictions</h3>
                <p className="text-gray-600">Create predictions to track them here.</p>
                <Button onClick={() => window.location.href = '/predictions'}>Create Prediction</Button>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ── Performance — REAL DATA ONLY ── */}
        <TabsContent value="performance" className="space-y-4">
          {totalPredictions === 0 ? (
            <Card className="p-12 text-center">
              <div className="space-y-4">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                  <BarChart2 className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">No Performance Data Yet</h3>
                <p className="text-gray-600">Make predictions to see your performance stats here.</p>
                <Button onClick={() => window.location.href = '/predictions'}>Start Predicting</Button>
              </div>
            </Card>
          ) : (
            <>
              {/* Real summary stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-6 text-center">
                  <div className="text-3xl font-bold text-purple-600 mb-2">{totalPredictions}</div>
                  <p className="text-gray-600">Total Predictions</p>
                </Card>
                <Card className="p-6 text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-2">
                    {accuracyRate ? `${accuracyRate}%` : "—"}
                  </div>
                  <p className="text-gray-600">Accuracy Rate</p>
                  {!accuracyRate && <p className="text-xs text-gray-400 mt-1">Not enough data</p>}
                </Card>
                <Card className="p-6 text-center">
                  <div className="text-3xl font-bold text-green-600 mb-2">{activePredictions.length}</div>
                  <p className="text-gray-600">Active Predictions</p>
                </Card>
              </div>

              {/* Prediction breakdown */}
              <Card className="p-6">
                <CardTitle className="mb-4">Predictions by Stock</CardTitle>
                {stockSymbols.length > 0 ? (
                  <div className="space-y-3">
                    {stockSymbols.map(symbol => {
                      const preds = predsByStock[symbol];
                      const latest = preds[preds.length - 1];
                      const avgConfidence = (preds.reduce((a: number, p: any) => a + (p.confidence || 0), 0) / preds.length).toFixed(1);
                      return (
                        <div key={symbol} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <span className="font-semibold">{symbol}</span>
                            <span className="text-sm text-gray-500 ml-2">{preds.length} prediction{preds.length > 1 ? 's' : ''}</span>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium text-blue-600">{avgConfidence}% avg confidence</div>
                            <div className="text-xs text-gray-400">
                              Last: ₹{Number(latest.predLow).toFixed(0)}–₹{Number(latest.predHigh).toFixed(0)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">Only crypto predictions found. Make stock predictions to see breakdown.</p>
                )}
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
