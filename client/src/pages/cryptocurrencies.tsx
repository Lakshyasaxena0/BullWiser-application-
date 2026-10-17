import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, TrendingUp, TrendingDown, Bitcoin, BarChart2 } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";

export default function TradingHistoryPage() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();

  const { data: predictions, isLoading } = useQuery<any[]>({
    queryKey: ["/api/user/predictions"],
    enabled: isAuthenticated,
  });

  const allTrades = predictions || [];
  const stockTrades = allTrades.filter(p => !p.stock?.startsWith('CRYPTO_'));
  const cryptoTrades = allTrades.filter(p => p.stock?.startsWith('CRYPTO_'));

  // Stats from real data
  const totalTrades = allTrades.length;
  const activeTrades = allTrades.filter(p => p.isActive).length;
  const avgConfidence = totalTrades > 0
    ? (allTrades.reduce((sum, p) => sum + (p.confidence || 0), 0) / totalTrades).toFixed(1)
    : 0;
  const winRate = totalTrades > 0
    ? ((allTrades.filter(p => (p.predHigh - p.currentPrice) > 0).length / totalTrades) * 100).toFixed(1)
    : 0;

  const getStatusBadge = (isActive: boolean) =>
    isActive
      ? <Badge className="bg-blue-100 text-blue-800">Active</Badge>
      : <Badge className="bg-gray-100 text-gray-800">Past</Badge>;

  const getConfidenceColor = (c: number) =>
    c >= 70 ? "text-green-600" : c >= 50 ? "text-amber-600" : "text-red-600";

  const renderTable = (trades: any[], isCrypto = false) => {
    if (trades.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 space-y-3">
          <BarChart2 className="h-12 w-12 text-gray-300" />
          <p className="text-sm font-medium">No {isCrypto ? "crypto" : "stock"} predictions yet</p>
          <Button size="sm" variant="outline" onClick={() => setLocation(isCrypto ? '/cryptocurrencies' : '/')}>
            {isCrypto ? "Go to Crypto" : "Go to Dashboard"}
          </Button>
        </div>
      );
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
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
            const symbol = isCrypto ? p.stock.replace('CRYPTO_', '') : p.stock;
            return (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center space-x-2">
                    {isCrypto
                      ? <Bitcoin className="h-4 w-4 text-orange-500" />
                      : <div className="w-4 h-4 bg-blue-500 rounded-full" />}
                    <span>{symbol}</span>
                  </div>
                </TableCell>
                <TableCell>₹{p.currentPrice?.toFixed(2) ?? '—'}</TableCell>
                <TableCell className="text-red-600">₹{p.predLow?.toFixed(2) ?? '—'}</TableCell>
                <TableCell className="text-green-600">₹{p.predHigh?.toFixed(2) ?? '—'}</TableCell>
                <TableCell className={getConfidenceColor(p.confidence)}>
                  {p.confidence?.toFixed(1)}%
                </TableCell>
                <TableCell>{p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN') : '—'}</TableCell>
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
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation('/')}>
          <ChevronLeft className="h-4 w-4 mr-1" />Back to Dashboard
        </Button>
        <div className="border-l pl-4">
          <h1 className="text-2xl font-bold text-gray-900">Trading History</h1>
          <p className="text-gray-600">Track your trading performance and history</p>
        </div>
      </div>

      {/* Real stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-600">Total Predictions</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-gray-900">{totalTrades}</div><p className="text-sm text-gray-500">All time</p></CardContent>
        </Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-600">Active</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-blue-600">{activeTrades}</div><p className="text-sm text-gray-500">Currently active</p></CardContent>
        </Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-600">Avg Confidence</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{avgConfidence}%</div><p className="text-sm text-gray-500">Across all predictions</p></CardContent>
        </Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-600">Bullish Rate</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-purple-600">{winRate}%</div><p className="text-sm text-gray-500">Upward predictions</p></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="stocks">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="stocks">Stock Predictions ({stockTrades.length})</TabsTrigger>
          <TabsTrigger value="crypto">Crypto Predictions ({cryptoTrades.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="stocks">
          <Card>
            <CardHeader><CardTitle>Stock Prediction History</CardTitle></CardHeader>
            <CardContent>
              {isLoading
                ? <div className="flex justify-center py-8"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>
                : renderTable(stockTrades, false)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="crypto">
          <Card>
            <CardHeader><CardTitle>Crypto Prediction History</CardTitle></CardHeader>
            <CardContent>
              {isLoading
                ? <div className="flex justify-center py-8"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>
                : renderTable(cryptoTrades, true)}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
