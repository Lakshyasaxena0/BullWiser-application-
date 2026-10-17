
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Download, Filter, TrendingUp, TrendingDown, Bitcoin } from "lucide-react";
import { useLocation } from "wouter";

export default function CryptoTradingHistory() {
  const [, setLocation] = useLocation();
  const [filter, setFilter] = useState('all');

  const cryptoTrades = [
    {
      id: 1,
      symbol: 'BTC',
      name: 'Bitcoin',
      type: 'BUY',
      quantity: 0.5,
      price: 45250.80,
      currentPrice: 47890.25,
      date: '2024-01-15',
      status: 'ACTIVE',
      pnl: +1319.73,
      pnlPercent: +5.83
    },
    {
      id: 2,
      symbol: 'ETH',
      name: 'Ethereum',
      type: 'SELL',
      quantity: 2.5,
      price: 2890.50,
      currentPrice: 2756.30,
      date: '2024-01-14',
      status: 'CLOSED',
      pnl: +335.50,
      pnlPercent: +4.64
    },
    {
      id: 3,
      symbol: 'ADA',
      name: 'Cardano',
      type: 'BUY',
      quantity: 1000,
      price: 0.485,
      currentPrice: 0.452,
      date: '2024-01-12',
      status: 'ACTIVE',
      pnl: -33.00,
      pnlPercent: -6.80
    },
    {
      id: 4,
      symbol: 'SOL',
      name: 'Solana',
      type: 'BUY',
      quantity: 10,
      price: 89.60,
      currentPrice: 98.45,
      date: '2024-01-10',
      status: 'ACTIVE',
      pnl: +88.50,
      pnlPercent: +9.87
    },
    {
      id: 5,
      symbol: 'DOGE',
      name: 'Dogecoin',
      type: 'BUY',
      quantity: 5000,
      price: 0.078,
      currentPrice: 0.084,
      date: '2024-01-08',
      status: 'CLOSED',
      pnl: +30.00,
      pnlPercent: +7.69
    }
  ];

  const filteredTrades = filter === 'all' ? cryptoTrades : cryptoTrades.filter(trade => trade.status.toLowerCase() === filter);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Active</Badge>;
      case 'CLOSED':
        return <Badge variant="secondary" className="bg-gray-100 text-gray-800">Closed</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getPnLDisplay = (pnl: number, pnlPercent: number) => {
    const isPositive = pnl > 0;
    const color = isPositive ? 'text-green-600' : 'text-red-600';
    const icon = isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />;
    
    return (
      <div className={`flex items-center space-x-1 ${color}`}>
        {icon}
        <span className="font-semibold">
          ${Math.abs(pnl).toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </span>
        <span className="text-sm">
          ({isPositive ? '+' : '-'}{Math.abs(pnlPercent).toFixed(2)}%)
        </span>
      </div>
    );
  };

  const totalPnL = cryptoTrades.reduce((sum, trade) => sum + trade.pnl, 0);
  const activeTrades = cryptoTrades.filter(trade => trade.status === 'ACTIVE').length;
  const totalTrades = cryptoTrades.length;
  const winRate = ((cryptoTrades.filter(trade => trade.pnl > 0).length / totalTrades) * 100).toFixed(1);

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
              Crypto Trading History
            </h1>
            <p className="text-gray-600" data-testid="text-page-description">
              Track your cryptocurrency trading performance and history
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
          <Filter className="h-4 w-4 text-gray-500" />
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1 text-sm"
          >
            <option value="all">All Trades</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total P&L</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalPnL > 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${totalPnL.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-sm text-gray-500">All time crypto</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Active Trades</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{activeTrades}</div>
            <p className="text-sm text-gray-500">Currently open</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Trades</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{totalTrades}</div>
            <p className="text-sm text-gray-500">This month</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Win Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{winRate}%</div>
            <p className="text-sm text-gray-500">Success rate</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="table" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="table">Table View</TabsTrigger>
          <TabsTrigger value="charts">Performance Charts</TabsTrigger>
        </TabsList>
        
        <TabsContent value="table">
          <Card>
            <CardHeader>
              <CardTitle>Crypto Trade History</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cryptocurrency</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Entry Price</TableHead>
                    <TableHead>Current Price</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>P&L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTrades.map((trade) => (
                    <TableRow key={trade.id}>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Bitcoin className="h-4 w-4 text-orange-500" />
                          <div>
                            <div className="font-medium">{trade.symbol}</div>
                            <div className="text-sm text-gray-500">{trade.name}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={trade.type === 'BUY' ? 'default' : 'secondary'}>
                          {trade.type}
                        </Badge>
                      </TableCell>
                      <TableCell>{trade.quantity}</TableCell>
                      <TableCell>${trade.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell>${trade.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell>{new Date(trade.date).toLocaleDateString('en-US')}</TableCell>
                      <TableCell>{getStatusBadge(trade.status)}</TableCell>
                      <TableCell>{getPnLDisplay(trade.pnl, trade.pnlPercent)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="charts">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Crypto P&L Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] flex items-center justify-center text-gray-500">
                  Cryptocurrency P&L Chart will be rendered here
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Crypto Portfolio Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] flex items-center justify-center text-gray-500">
                  Crypto Portfolio Distribution Chart will be rendered here
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Top Performing Cryptocurrencies</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {cryptoTrades.filter(t => t.pnl > 0).sort((a, b) => b.pnlPercent - a.pnlPercent).slice(0, 3).map((trade) => (
                    <div key={trade.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <Bitcoin className="h-6 w-6 text-orange-500" />
                        <div>
                          <div className="font-medium">{trade.symbol}</div>
                          <div className="text-sm text-gray-500">{trade.name}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-green-600 font-medium">+{trade.pnlPercent.toFixed(2)}%</div>
                        <div className="text-sm text-gray-500">${trade.pnl.toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
