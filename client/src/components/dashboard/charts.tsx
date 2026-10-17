import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { TrendingUp } from "lucide-react";

declare global {
  interface Window { Chart: any; }
}

export default function Charts() {
  const accuracyChartRef = useRef<HTMLCanvasElement>(null);
  const accuracyChartInstance = useRef<any>(null);
  const [predictionPeriod, setPredictionPeriod] = useState("1month");
  const { isAuthenticated } = useAuth();

  // ✅ FETCH REAL PREDICTION HISTORY AND CALCULATE ACCURACY
  const { data: predictionHistory } = useQuery({
    queryKey: ["/api/user/predictions"],
    enabled: isAuthenticated,
    select: (data: any[]) => {
      if (!data || data.length === 0) return null;
      
      // Only include predictions with actual prices (completed predictions)
      const measured = data.filter((p: any) => p.actualPrice !== null && p.actualPrice !== undefined);
      
      if (measured.length === 0) return null;
      
      // Group by week for the chart
      const weeklyData = new Map<string, { correct: number; total: number }>();
      
      measured.forEach((pred: any) => {
        const predDate = new Date(pred.createdAt);
        const now = new Date();
        const weeksDiff = Math.floor((now.getTime() - predDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
        const weekKey = `Week ${Math.max(1, 4 - weeksDiff)}`;
        
        if (!weeklyData.has(weekKey)) {
          weeklyData.set(weekKey, { correct: 0, total: 0 });
        }
        
        const stats = weeklyData.get(weekKey)!;
        stats.total++;
        
        // Check if prediction was accurate (actual price within predicted range)
        const withinRange = pred.actualPrice >= pred.predLow && pred.actualPrice <= pred.predHigh;
        if (withinRange) stats.correct++;
      });
      
      // Convert to chart data - sort by week
      const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
      return weeks
        .filter(week => weeklyData.has(week))
        .map(week => {
          const stats = weeklyData.get(week)!;
          return {
            week,
            accuracy: Math.round((stats.correct / stats.total) * 100),
            total: stats.total,
            correct: stats.correct
          };
        });
    }
  });

  const hasPredictions = predictionHistory && predictionHistory.length > 0;

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    script.onload = () => initializeCharts();
    document.head.appendChild(script);
    return () => {
      accuracyChartInstance.current?.destroy();
    };
  }, []);

  useEffect(() => {
    if (window.Chart) initializeCharts();
  }, [predictionHistory, predictionPeriod, hasPredictions]);

  const initializeCharts = () => {
    if (!window.Chart) return;
    accuracyChartInstance.current?.destroy();

    // ✅ DRAW ACCURACY CHART ONLY IF USER HAS PREDICTIONS WITH RESULTS
    if (accuracyChartRef.current && hasPredictions) {
      const labels = predictionHistory.map((d: any) => d.week);
      const data = predictionHistory.map((d: any) => d.accuracy);
      
      const ctx = accuracyChartRef.current.getContext('2d');
      if (ctx) {
        accuracyChartInstance.current = new window.Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: 'Prediction Accuracy',
              data,
              borderColor: '#3B82F6',
              backgroundColor: 'rgba(59,130,246,0.1)',
              tension: 0.4,
              fill: true,
              borderWidth: 2,
              pointRadius: 4,
              pointBackgroundColor: '#3B82F6'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (context: any) => {
                    const dataPoint = predictionHistory[context.dataIndex];
                    return [
                      `Accuracy: ${context.parsed.y}%`,
                      `Correct: ${dataPoint.correct}/${dataPoint.total}`
                    ];
                  }
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                max: 100,
                ticks: { callback: (v: any) => v + '%' }
              },
              x: {
                grid: { display: false }
              }
            }
          }
        });
      }
    }
  };

  return (
    <div className="w-full">
      {/* ✅ REMOVED: Market Performance Chart (NIFTY 50) */}
      {/* ✅ KEPT ONLY: Prediction Accuracy Chart with REAL DATA */}
      <Card className="shadow-sm border border-gray-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Prediction Accuracy</CardTitle>
              <CardDescription>Your model's performance over time</CardDescription>
            </div>
            <Select value={predictionPeriod} onValueChange={setPredictionPeriod}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1week">1 Week</SelectItem>
                <SelectItem value="1month">1 Month</SelectItem>
                <SelectItem value="3months">3 Months</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {!hasPredictions ? (
            <div className="h-[300px] flex flex-col items-center justify-center text-gray-400 space-y-3">
              <TrendingUp className="h-12 w-12 text-gray-300" />
              <p className="text-sm font-medium">No completed predictions yet</p>
              <p className="text-xs text-gray-400">Make predictions and wait for target dates to see accuracy charts</p>
            </div>
          ) : (
            <div className="h-[300px] relative">
              <canvas ref={accuracyChartRef} className="w-full h-full" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
