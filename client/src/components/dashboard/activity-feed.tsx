import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Search, Clock, CheckCircle, Bitcoin } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";

export default function ActivityFeed() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();

  const { data: predictions } = useQuery<any[]>({
    queryKey: ["/api/user/predictions"],
    enabled: isAuthenticated,
  });

  const { data: subscriptions } = useQuery<any[]>({
    queryKey: ["/api/user/subscriptions"],
    enabled: isAuthenticated,
  });

  // Build unified activity list from real data
  const activities: any[] = [];

  if (predictions && predictions.length > 0) {
    predictions.forEach((p: any) => {
      const isCrypto = p.stock?.startsWith('CRYPTO_');
      const symbol = isCrypto ? p.stock.replace('CRYPTO_', '') : p.stock;
      activities.push({
        id: `pred-${p.id}`,
        icon: isCrypto ? Bitcoin : TrendingUp,
        iconColor: isCrypto ? 'bg-orange-500' : 'bg-blue-500',
        title: `${isCrypto ? 'Crypto' : 'Stock'} prediction — ${symbol}`,
        description: `Target: ₹${p.predLow?.toFixed(2)} – ₹${p.predHigh?.toFixed(2)} · Confidence: ${p.confidence?.toFixed(1)}%`,
        sortTime: p.createdAt ? new Date(p.createdAt).getTime() : 0,
        time: p.createdAt ? formatDistanceToNow(new Date(p.createdAt), { addSuffix: true }) : 'recently',
      });
    });
  }

  if (subscriptions && subscriptions.length > 0) {
    subscriptions.forEach((s: any) => {
      activities.push({
        id: `sub-${s.id}`,
        icon: CheckCircle,
        iconColor: 'bg-green-500',
        title: `Subscription activated — ${s.mode} plan`,
        description: `${s.tradeType} risk · ${s.tradesPerDay} trades/day · ₹${s.price}`,
        sortTime: s.createdAt ? new Date(s.createdAt).getTime() : 0,
        time: s.createdAt ? formatDistanceToNow(new Date(s.createdAt), { addSuffix: true }) : 'recently',
      });
    });
  }

  // Sort by newest first, show top 5
  activities.sort((a, b) => b.sortTime - a.sortTime);
  const top5 = activities.slice(0, 5);

  return (
    <Card className="shadow-sm border border-gray-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setLocation('/activities')}>View All</Button>
        </div>
      </CardHeader>
      <CardContent>
        {top5.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-gray-400 space-y-3">
            <Search className="h-12 w-12 text-gray-300" />
            <p className="text-sm font-medium">No activity yet</p>
            <p className="text-xs text-center text-gray-400">Your predictions and subscriptions will appear here</p>
            <Button size="sm" variant="outline" onClick={() => setLocation('/plans')}>Get Started</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {top5.map((activity) => {
              const Icon = activity.icon;
              return (
                <div key={activity.id} className="flex items-start space-x-4 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className={`w-9 h-9 ${activity.iconColor} rounded-full flex items-center justify-center flex-shrink-0`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm">{activity.title}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{activity.description}</p>
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />{activity.time}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
