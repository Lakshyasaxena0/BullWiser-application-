import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

import MarketOverview from "@/components/dashboard/market-overview";
import Charts from "@/components/dashboard/charts";
import ActivityFeed from "@/components/dashboard/activity-feed";
import TrainingStatus from "@/components/dashboard/training-status";
import StockRatePanel from "@/components/dashboard/stock-rate-panel";
import CreditsSummary from "@/components/CreditsSummary";
import TrendingStocks from "@/components/dashboard/trending-stocks";
import { TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({ title: "Unauthorized", description: "You are logged out. Logging in again...", variant: "destructive" });
      setTimeout(() => { window.location.href = "/api/login"; }, 500);
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: marketData } = useQuery({ queryKey: ["/api/market/overview"], enabled: isAuthenticated });
  const { data: activePredictions } = useQuery({ queryKey: ["/api/user/predictions/active"], enabled: isAuthenticated });

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Top row: Market Overview + Stock Rate Checker */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MarketOverview marketData={marketData} />
        <StockRatePanel />
      </div>

      {/* Live gainers / losers / most traded, scanned across ~100 NSE stocks */}
      <TrendingStocks />

      {/* Charts section - Prediction Accuracy only (Market Performance removed) */}
      <Charts />

      {/* Main content grid: Activity Feed + Right Sidebar (Trending Stocks) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ActivityFeed />
        </div>
        <div className="space-y-6">
          <CreditsSummary />

          {/* Training Status */}
          <TrainingStatus />
        </div>
      </div>

    </div>
  );
}
