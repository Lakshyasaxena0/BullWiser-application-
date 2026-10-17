import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { Play, RefreshCw, Brain } from "lucide-react";

export default function TrainingStatus() {
  const { toast } = useToast();
  const { user } = useAuth();

  const isDeveloper = !!user && user.role === 'developer';

  // Hooks must run on every render, so the developer-only gate is applied AFTER them
  // (an early return before useQuery/useMutation changed the hook count when the user
  // loaded or changed role and made React throw "Rendered more hooks than ...").
  const { data: trainingStatus, refetch } = useQuery<{ progress?: number; message?: string }>({
    queryKey: ["/api/training/status"],
    refetchInterval: 5000, // Refetch every 5 seconds when training is active
    enabled: isDeveloper,
  });

  const startTrainingMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/training/start", {});
      return response.json();
    },
    onSuccess: (data) => {
      if (data.status === 'started') {
        toast({
          title: "Training Started",
          description: "AI model training has begun.",
        });
      } else if (data.status === 'running') {
        toast({
          title: "Training In Progress",
          description: "Training is already running.",
        });
      }
      refetch();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to start training. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleStartTraining = () => {
    startTrainingMutation.mutate();
  };

  const handleCheckStatus = () => {
    refetch();
    toast({
      title: "Status Updated",
      description: "Training status refreshed successfully.",
    });
  };

  const progress = trainingStatus?.progress || 0;
  const message = trainingStatus?.message || "Not started";
  const isTraining = progress > 0 && progress < 100;

  // Only show training status for developers
  if (!isDeveloper) return null;

  return (
    <Card className="shadow-sm border border-gray-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 flex items-center" data-testid="text-training-title">
            <Brain className="h-5 w-5 mr-2" />
            AI Training Status
          </CardTitle>
          <div className={`w-3 h-3 rounded-full ${isTraining ? 'bg-green-400 animate-pulse-slow' : 'bg-gray-300'}`} />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Model Training</span>
            <span className="text-sm font-semibold text-gray-900" data-testid="text-training-progress">
              {progress}%
            </span>
          </div>
          
          <Progress 
            value={progress} 
            className="h-2"
            data-testid="progress-training"
          />
          
          <p className="text-xs text-gray-500" data-testid="text-training-message">
            {message}
          </p>
        </div>

        <div className="space-y-2">
          <Button
            onClick={handleStartTraining}
            disabled={startTrainingMutation.isPending || isTraining}
            className="w-full bg-primary hover:bg-blue-700 text-white"
            data-testid="button-start-training"
          >
            <Play className="h-4 w-4 mr-2" />
            {startTrainingMutation.isPending 
              ? "Starting..." 
              : isTraining 
                ? "Training in Progress" 
                : "Start Training"
            }
          </Button>
          
          <Button
            variant="outline"
            onClick={handleCheckStatus}
            className="w-full"
            data-testid="button-check-status"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Check Status
          </Button>
        </div>

        {progress === 100 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <Brain className="h-5 w-5 text-green-400" />
              </div>
              <div className="ml-3">
                <h4 className="text-sm font-medium text-green-800" data-testid="text-training-complete">
                  Training Complete
                </h4>
                <p className="text-sm text-green-700 mt-1">
                  Your AI model has been successfully trained and is ready for predictions.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
