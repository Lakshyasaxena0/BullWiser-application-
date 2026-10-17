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
  const { data: subscriptions } = useQuery({ queryKey: ["/api/user/subscriptions"], enabled: isAuthenticated });

  // Get active subscription for renewal date
  const activeSubscription = (subscriptions as any[])?.find((s: any) => new Date(s.endTs * 1000) > new Date());

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

      {/* Charts section - Prediction Accuracy only (Market Performance removed) */}
      <Charts />

      {/* Main content grid: Activity Feed + Right Sidebar (Trending Stocks) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ActivityFeed />
        </div>
        <div className="space-y-6">
          {/* ✅ Trending Stocks Panel (Right Sidebar - Image 1) */}
          <TrendingStocks />

          {/* Subscription Card */}
          <div className="bg-gray-100 border border-gray-200 rounded-xl p-6 text-gray-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {activeSubscription ? `${activeSubscription.mode} Plan` : "No Active Plan"}
              </h3>
              <i className="fas fa-crown text-xl text-yellow-500"></i>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Usage</span>
                <span className="font-semibold text-gray-900">{(activePredictions as any[])?.length || 0}/200</span>
              </div>
              <div className="w-full bg-gray-300 rounded-full h-2">
                <div className="bg-gray-600 h-2 rounded-full" style={{ width: `${Math.min((((activePredictions as any[])?.length || 0) / 200) * 100, 100)}%` }} />
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Renewal</span>
                <span className="font-semibold text-gray-900">
                  {activeSubscription
                    ? new Date(activeSubscription.endTs * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                    : "—"}
                </span>
              </div>
            </div>
            <button onClick={() => setLocation('/plans')} className="w-full bg-white text-primary font-semibold py-2 px-4 rounded-lg mt-4 hover:bg-gray-100 transition-colors duration-200">
              {activeSubscription ? "Manage Plan" : "Choose Plan"}
            </button>
          </div>

          {/* Training Status */}
          <TrainingStatus />
        </div>
      </div>

      {/* Subscription prompt for users without plan */}
      {(!subscriptions || (subscriptions as any[]).length === 0) && (
        <div className="bg-gradient-to-r from-blue-100 to-blue-200 border border-blue-300 rounded-lg p-4 text-center">
          <div className="flex items-center justify-center gap-3">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            <div className="text-left">
              <h4 className="font-semibold text-blue-900 text-sm">Subscribe to Start Predicting</h4>
              <p className="text-blue-700 text-xs">Get AI-powered stock predictions with real-time data</p>
            </div>
            <button onClick={() => setLocation('/plans')} className="bg-blue-600 text-white font-medium py-2 px-4 rounded-lg text-sm hover:bg-blue-700 ml-auto">
              Choose Plan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
