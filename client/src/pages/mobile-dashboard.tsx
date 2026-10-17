import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import MobileHeader from "@/components/mobile/MobileHeader";
import MobileBottomNav from "@/components/mobile/MobileBottomNav";
import MobilePredictionCard from "@/components/mobile/MobilePredictionCard";
import { 
  TrendingUp, 
  Bell, 
  BellOff,
  ChartBar,
  Activity,
  DollarSign,
  Target
} from "lucide-react";

export default function MobileDashboard() {
  const { user } = useAuth();
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const {
    isSupported,
    permission,
    subscription,
    subscribeToPush,
    unsubscribeFromPush,
    sendTestNotification
  } = usePushNotifications();

  // Fetch market overview
  const { data: marketData } = useQuery<any>({
    queryKey: ["/api/market/overview"],
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch active predictions
  const { data: predictions } = useQuery<any[]>({
    queryKey: ["/api/user/predictions/active"],
  });

  // Register service worker on mount
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => console.log('SW registered:', registration))
        .catch(error => console.log('SW registration failed:', error));
    }
  }, []);

  const marketIndices = marketData?.indices || {};
  const nifty = marketIndices.nifty50 || {};
  const sensex = marketIndices.sensex || {};

  return (
    <div className="min-h-screen bg-gray-50">
      <MobileHeader 
        onMenuClick={() => setShowNotificationSettings(!showNotificationSettings)}
        notificationCount={3}
      />

      <div className="main-content-mobile px-4 py-4">
        {/* Push Notification Settings (shown when menu clicked) */}
        {showNotificationSettings && (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Push Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!isSupported ? (
                <p className="text-sm text-gray-600">
                  Push notifications are not supported in your browser
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Notification Status</span>
                    <Badge variant={permission === 'granted' ? 'default' : 'secondary'}>
                      {permission}
                    </Badge>
                  </div>
                  
                  {permission === 'granted' && subscription ? (
                    <div className="space-y-2">
                      <Button
                        onClick={sendTestNotification}
                        size="sm"
                        className="w-full"
                        variant="outline"
                      >
                        Send Test Notification
                      </Button>
                      <Button
                        onClick={unsubscribeFromPush}
                        size="sm"
                        className="w-full"
                        variant="destructive"
                      >
                        <BellOff className="h-4 w-4 mr-2" />
                        Disable Notifications
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={subscribeToPush}
                      size="sm"
                      className="w-full"
                    >
                      <Bell className="h-4 w-4 mr-2" />
                      Enable Push Notifications
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Welcome Section */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold">
            Welcome back{user?.firstName ? `, ${user.firstName}` : ''}!
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            Your smart trading companion
          </p>
        </div>

        {/* Market Indices */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">NIFTY 50</span>
                <ChartBar className="h-4 w-4 text-gray-400" />
              </div>
              <p className="text-lg font-bold">
                {nifty.value ? `₹${nifty.value.toFixed(2)}` : '--'}
              </p>
              <p className={`text-xs mt-1 ${nifty.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {nifty.change >= 0 ? '+' : ''}{nifty.change?.toFixed(2) || '0'}
                ({nifty.changePercent?.toFixed(2) || '0'}%)
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">SENSEX</span>
                <Activity className="h-4 w-4 text-gray-400" />
              </div>
              <p className="text-lg font-bold">
                {sensex.value ? `₹${sensex.value.toFixed(2)}` : '--'}
              </p>
              <p className={`text-xs mt-1 ${sensex.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {sensex.change >= 0 ? '+' : ''}{sensex.change?.toFixed(2) || '0'}
                ({sensex.changePercent?.toFixed(2) || '0'}%)
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Card>
            <CardContent className="p-3 text-center">
              <DollarSign className="h-5 w-5 mx-auto text-green-600 mb-1" />
              <p className="text-xs text-gray-500">Portfolio</p>
              <p className="text-sm font-bold">₹1,25,000</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-3 text-center">
              <TrendingUp className="h-5 w-5 mx-auto text-blue-600 mb-1" />
              <p className="text-xs text-gray-500">Today's P/L</p>
              <p className="text-sm font-bold text-green-600">+₹2,450</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-3 text-center">
              <Target className="h-5 w-5 mx-auto text-purple-600 mb-1" />
              <p className="text-xs text-gray-500">Accuracy</p>
              <p className="text-sm font-bold">78%</p>
            </CardContent>
          </Card>
        </div>

        {/* Active Predictions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Active Predictions</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              {predictions && predictions.length > 0 ? (
                predictions.map((pred: any) => (
                  <MobilePredictionCard
                    key={pred.id}
                    stock={pred.stock}
                    currentPrice={pred.currentPrice}
                    predictedRange={{
                      low: pred.predLow,
                      high: pred.predHigh
                    }}
                    confidence={pred.confidence}
                    change={pred.pctChange || 0}
                    time={new Date(pred.when).toLocaleTimeString()}
                    onViewDetails={() => window.location.href = '/predictions'}
                  />
                ))
              ) : (
                <p className="text-center text-gray-500 py-8">
                  No active predictions. Generate one to get started!
                </p>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <MobileBottomNav />
    </div>
  );
}