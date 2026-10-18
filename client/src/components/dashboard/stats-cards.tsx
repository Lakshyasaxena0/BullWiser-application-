import { Card, CardContent } from "@/components/ui/card";
import { ListChecks, TrendingUp, Target, Hourglass } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

interface StatsCardsProps {
  activePredictions: number;
  subscriptions: any[];
}

export default function StatsCards({ activePredictions, subscriptions }: StatsCardsProps) {
  const [, setLocation] = useLocation();

  const { data: stats, isLoading } = useQuery<any>({
    queryKey: ["/api/user/dashboard-stats"],
    staleTime: 60000,
  });


  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1,2,3,4].map(i => (
          <Card key={i}><CardContent className="p-6 space-y-3">
            <Skeleton className="h-4 w-32" /><Skeleton className="h-8 w-24" /><Skeleton className="h-4 w-20" />
          </CardContent></Card>
        ))}
      </div>
    );
  }

  const totalPredictions = stats?.totalPredictions ?? 0;
  const scored = stats?.scored ?? 0;
  const accuracyRate: number | null = stats?.accuracyRate ?? null;
  const pending = stats?.pending ?? 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <Card className="hover:shadow-lg transition-shadow">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Predictions Made</p>
              <p className="text-2xl font-bold text-gray-900">{totalPredictions}</p>
              <p className="text-sm text-gray-400 mt-1">{totalPredictions === 0 ? 'No predictions yet' : `${scored} checked against the real price`}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <ListChecks className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Predictions */}
      <Card className="hover:shadow-lg transition-shadow cursor-pointer hover:border-primary" onClick={() => setLocation('/predictions')}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Predictions</p>
              <p className="text-2xl font-bold text-gray-900">{activePredictions}</p>
              <p className="text-sm text-primary font-medium">
                {totalPredictions > 0 ? `${totalPredictions} total made` : 'Click to view history'}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Accuracy Rate — only from predictions already checked against the real price */}
      <Card className="hover:shadow-lg transition-shadow">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Accuracy Rate</p>
              <p className="text-2xl font-bold text-gray-900">{accuracyRate !== null ? `${accuracyRate}%` : '—'}</p>
              <p className="text-sm text-purple-600 font-medium">
                {accuracyRate !== null ? `${stats.correct} right · ${stats.wrong} wrong` : 'Shown after your first prediction is checked'}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Target className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="hover:shadow-lg transition-shadow">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Waiting for Result</p>
              <p className="text-2xl font-bold text-gray-900">{pending}</p>
              <p className="text-sm text-orange-600 font-medium">Checked automatically after the target date</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <Hourglass className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
