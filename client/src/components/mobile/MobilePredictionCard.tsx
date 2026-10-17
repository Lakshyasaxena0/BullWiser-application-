import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Clock } from "lucide-react";

interface MobilePredictionCardProps {
  stock: string;
  currentPrice: number;
  predictedRange: {
    low: number;
    high: number;
  };
  confidence: number;
  change: number;
  time: string;
  onViewDetails?: () => void;
}

export default function MobilePredictionCard({
  stock,
  currentPrice,
  predictedRange,
  confidence,
  change,
  time,
  onViewDetails
}: MobilePredictionCardProps) {
  const isPositive = change >= 0;
  
  return (
    <Card className="mb-3">
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="font-bold text-lg">{stock}</h3>
            <p className="text-sm text-gray-500 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {time}
            </p>
          </div>
          <Badge 
            className={confidence >= 80 ? 'bg-green-100 text-green-800' : confidence >= 60 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}
          >
            {confidence}% confidence
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <p className="text-xs text-gray-500">Current</p>
            <p className="font-semibold text-lg">₹{currentPrice}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Predicted</p>
            <p className="font-semibold text-lg">
              ₹{predictedRange.low} - ₹{predictedRange.high}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            <span className="font-semibold">
              {isPositive ? '+' : ''}{change.toFixed(2)}%
            </span>
          </div>
          
          <Button 
            size="sm" 
            variant="outline"
            onClick={onViewDetails}
            data-testid={`mobile-view-details-${stock}`}
          >
            View Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}