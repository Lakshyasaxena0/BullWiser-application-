import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from "lucide-react";

// Helper function to format Indian date/time
function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${day}/${month}/${year}, ${hours}:${minutes} ${ampm}`;
}

interface PredictionAnalytics {
  id: number;
  stock: string;
  stockName: string;
  isCrypto: boolean;
  currentPrice: number;
  predictedLow: number;
  predictedHigh: number;
  predictedMid: number;
  actualPrice: number | null;
  deviation: number | null;
  confidence: number;
  accuracyScore: number | null;
  isAccurate: boolean | null;
  predictionDate: string;
  targetDate: string | null;
  daysAhead: number | null;
  statisticalReasoning: string | null;
  astroReasoning: string | null;
  planetaryData: any | null;
  aiLearning: string | null;
  feedbackUseful: boolean | null;
  mode: string;
  riskLevel: string;
  isActive: boolean;
}

export default function PredictionAnalytics() {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'accurate' | 'inaccurate' | 'pending'>('all');

  const { data: predictions, isLoading, refetch } = useQuery<PredictionAnalytics[]>({
    queryKey: ['/api/predictions/history', { limit: 100 }],
    refetchOnMount: true,
  });

  const { data: stats } = useQuery<any>({
    queryKey: ['/api/predictions/stats'],
    refetchOnMount: true,
  });

  const filteredPredictions = predictions?.filter(p => {
    if (filterType === 'all') return true;
    if (filterType === 'pending') return p.actualPrice === null;
    if (filterType === 'accurate') return p.isAccurate === true;
    if (filterType === 'inaccurate') return p.isAccurate === false;
    return true;
  }) || [];

  const renderAccuracyBadge = (prediction: PredictionAnalytics) => {
    if (prediction.actualPrice === null) {
      return <Badge variant="secondary">Pending</Badge>;
    }
    
    if (prediction.isAccurate) {
      return <Badge className="bg-green-100 text-green-800">✓ {prediction.accuracyScore}% Accurate</Badge>;
    }
    
    return <Badge className="bg-red-100 text-red-800">✗ {prediction.accuracyScore}% Accuracy</Badge>;
  };

  const renderPredictionCard = (prediction: PredictionAnalytics) => {
    const isExpanded = expandedId === prediction.id;
    const currencySymbol = prediction.isCrypto ? '$' : '₹';
    
    // Parse planetary data if it's a JSON string
    let parsedPlanetaryData = null;
    if (prediction.planetaryData) {
      try {
        parsedPlanetaryData = typeof prediction.planetaryData === 'string' 
          ? JSON.parse(prediction.planetaryData) 
          : prediction.planetaryData;
      } catch (e) {
        console.error('Failed to parse planetary data:', e);
      }
    }
    
    // Determine direction
    let directionIcon = Minus;
    let directionColor = 'text-gray-600';
    if (prediction.actualPrice && prediction.currentPrice) {
      if (prediction.actualPrice > prediction.currentPrice) {
        directionIcon = TrendingUp;
        directionColor = 'text-green-600';
      } else if (prediction.actualPrice < prediction.currentPrice) {
        directionIcon = TrendingDown;
        directionColor = 'text-red-600';
      }
    }
    const DirectionIcon = directionIcon;

    return (
      <Card key={prediction.id} className="mb-4">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg ${prediction.isCrypto ? 'bg-orange-100' : 'bg-blue-100'}`}>
                <span className="text-2xl">{prediction.isCrypto ? '🪙' : '📈'}</span>
              </div>
              <div>
                <CardTitle className="text-xl">{prediction.stock}</CardTitle>
                <p className="text-sm text-gray-500">{prediction.stockName}</p>
              </div>
            </div>
            <div className="text-right">
              {renderAccuracyBadge(prediction)}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Summary Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="text-xs text-gray-500">Current Price</p>
              <p className="text-lg font-semibold">{currencySymbol}{prediction.currentPrice.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Predicted</p>
              <p className="text-lg font-semibold text-blue-600">
                {currencySymbol}{prediction.predictedMid.toFixed(2)}
              </p>
              <p className="text-xs text-gray-400">
                ({currencySymbol}{prediction.predictedLow.toFixed(2)} - {currencySymbol}{prediction.predictedHigh.toFixed(2)})
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Actual Price</p>
              {prediction.actualPrice !== null ? (
                <>
                  <p className="text-lg font-semibold flex items-center gap-1">
                    <DirectionIcon className={`h-4 w-4 ${directionColor}`} />
                    {currencySymbol}{prediction.actualPrice.toFixed(2)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-400">Not available yet</p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-500">Deviation</p>
              {prediction.deviation !== null ? (
                <p className={`text-lg font-semibold ${Math.abs(prediction.deviation) < 5 ? 'text-green-600' : 'text-red-600'}`}>
                  {prediction.deviation > 0 ? '+' : ''}{prediction.deviation.toFixed(2)}%
                </p>
              ) : (
                <p className="text-sm text-gray-400">-</p>
              )}
            </div>
          </div>

          {/* Dates */}
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">🕐 Predicted:</span>
              <span className="font-medium">{formatDateTime(prediction.predictionDate)}</span>
            </div>
            {prediction.targetDate && (
              <div className="flex items-center gap-2">
                <span className="text-gray-500">🎯 Target:</span>
                <span className="font-medium">{formatDateTime(prediction.targetDate)}</span>
                {prediction.daysAhead && (
                  <Badge variant="outline" className="text-xs">
                    {prediction.daysAhead} days
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Expand/Collapse Button */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full flex items-center justify-center gap-2"
            onClick={() => setExpandedId(isExpanded ? null : prediction.id)}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-4 w-4" />
                Hide Details
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                Show Full Analysis
              </>
            )}
          </Button>

          {/* Expanded Details */}
          {isExpanded && (
            <div className="space-y-4 pt-4 border-t">
              {/* Statistical Logic */}
              {prediction.statisticalReasoning && (
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                    📊 Statistical Analysis
                  </h4>
                  <p className="text-sm text-blue-800">{prediction.statisticalReasoning}</p>
                </div>
              )}

              {/* Astro Logic */}
              {prediction.astroReasoning && (
                <div className="p-4 bg-purple-50 rounded-lg">
                  <h4 className="font-semibold text-purple-900 mb-2 flex items-center gap-2">
                    ⭐ Astrological Analysis
                  </h4>
                  <p className="text-sm text-purple-800">{prediction.astroReasoning}</p>
                </div>
              )}

              {/* Planetary Data */}
              {parsedPlanetaryData && Object.keys(parsedPlanetaryData).length > 0 && (
                <div className="p-4 bg-indigo-50 rounded-lg">
                  <h4 className="font-semibold text-indigo-900 mb-3 flex items-center gap-2">
                    🌍 Planetary Positions at Prediction Time
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    {Object.entries(parsedPlanetaryData)
                      .filter(([_, data]) => data !== null && data !== undefined)
                      .map(([planet, data]: [string, any]) => {
                        // Handle simple string/number values (hora, nakshatra)
                        if (typeof data === 'string' || typeof data === 'number') {
                          return (
                            <div key={planet} className="flex items-center gap-2">
                              <span className="font-medium capitalize text-indigo-900">{planet}:</span>
                              <span className="text-indigo-700">{data}</span>
                            </div>
                          );
                        }
                        
                        // Handle planetary objects with sign/house/degree
                        if (data && typeof data === 'object') {
                          return (
                            <div key={planet} className="flex flex-col">
                              <span className="font-medium capitalize text-indigo-900">{planet}</span>
                              <span className="text-xs text-indigo-700">
                                {data.sign || ''} {data.house ? `(House ${data.house})` : ''} 
                                {data.degree ? ` ${data.degree.toFixed(1)}°` : ''}
                              </span>
                            </div>
                          );
                        }
                        
                        return null;
                      })}
                  </div>
                </div>
              )}

              {/* AI Learning */}
              {prediction.aiLearning && (
                <div className="p-4 bg-green-50 rounded-lg">
                  <h4 className="font-semibold text-green-900 mb-2 flex items-center gap-2">
                    🧠 AI Learning & Insights
                  </h4>
                  <p className="text-sm text-green-800">{prediction.aiLearning}</p>
                </div>
              )}

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-4 text-sm pt-2 border-t">
                <div>
                  <span className="text-gray-500">Mode:</span>
                  <Badge variant="outline" className="ml-2">{prediction.mode}</Badge>
                </div>
                <div>
                  <span className="text-gray-500">Risk Level:</span>
                  <Badge variant="outline" className="ml-2">{prediction.riskLevel}</Badge>
                </div>
                <div>
                  <span className="text-gray-500">Confidence:</span>
                  <span className="ml-2 font-medium">{prediction.confidence}%</span>
                </div>
                <div>
                  <span className="text-gray-500">Status:</span>
                  <Badge variant={prediction.isActive ? "default" : "secondary"} className="ml-2">
                    {prediction.isActive ? "Active" : "Closed"}
                  </Badge>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">📊 Prediction Analytics</h1>
          <p className="text-sm text-gray-600">
            Detailed analysis of your predictions with AI learning insights
          </p>
        </div>
        <Button onClick={() => refetch()} disabled={isLoading} size="sm" variant="outline">
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-600">{stats.totalPredictions}</p>
                <p className="text-sm text-gray-600">Total Predictions</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">{stats.accuratePredictions}</p>
                <p className="text-sm text-gray-600">Accurate ({stats.accuracyRate.toFixed(1)}%)</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-purple-600">{stats.avgAccuracy.toFixed(1)}%</p>
                <p className="text-sm text-gray-600">Avg Accuracy</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-orange-600">±{stats.avgDeviation.toFixed(2)}%</p>
                <p className="text-sm text-gray-600">Avg Deviation</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={filterType === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterType('all')}
        >
          All ({predictions?.length || 0})
        </Button>
        <Button
          variant={filterType === 'accurate' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterType('accurate')}
          className="text-green-600"
        >
          ✓ Accurate ({predictions?.filter(p => p.isAccurate === true).length || 0})
        </Button>
        <Button
          variant={filterType === 'inaccurate' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterType('inaccurate')}
          className="text-red-600"
        >
          ✗ Inaccurate ({predictions?.filter(p => p.isAccurate === false).length || 0})
        </Button>
        <Button
          variant={filterType === 'pending' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterType('pending')}
        >
          ⏳ Pending ({predictions?.filter(p => p.actualPrice === null).length || 0})
        </Button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-2 text-gray-600">Loading prediction analytics...</p>
        </div>
      )}

      {/* Predictions List */}
      {!isLoading && filteredPredictions.length === 0 && (
        <Card className="p-12 text-center">
          <p className="text-gray-500">No predictions found for this filter.</p>
        </Card>
      )}

      {!isLoading && filteredPredictions.length > 0 && (
        <div className="space-y-4">
          {filteredPredictions.map(renderPredictionCard)}
        </div>
      )}

      {/* Disclaimer */}
      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="pt-6">
          <p className="text-xs text-amber-800">
            <strong>Note:</strong> This analytics page shows detailed insights into your predictions. 
            Actual prices are populated when you provide feedback or when our AI monitoring system 
            checks the predictions automatically. Use this data to understand pattern accuracy and 
            refine your trading strategy.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
