import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Send } from "lucide-react";
import { isUnauthorizedError } from "@/lib/authUtils";

export default function FeedbackForm() {
  const [feedbackStock, setFeedbackStock] = useState("");
  const [actualPrice, setActualPrice] = useState("");
  const [feedbackRating, setFeedbackRating] = useState("yes");

  const { toast } = useToast();

  const feedbackMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/feedback", data);
    },
    onSuccess: () => {
      toast({
        title: "Thank you for your feedback!",
        description: "Your input helps improve our prediction accuracy.",
      });
      setFeedbackStock("");
      setActualPrice("");
      setFeedbackRating("yes");
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmitFeedback = () => {
    if (!feedbackStock.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter a stock symbol.",
        variant: "destructive",
      });
      return;
    }

    feedbackMutation.mutate({
      stock: feedbackStock.toUpperCase(),
      when: new Date().toISOString(),
      actualPrice: actualPrice ? parseFloat(actualPrice) : null,
      useful: feedbackRating,
    });
  };

  return (
    <Card className="shadow-sm border border-gray-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900" data-testid="text-feedback-title">
            Prediction Feedback
          </CardTitle>
          <span className="text-sm text-gray-500" data-testid="text-feedback-subtitle">
            Help us improve our accuracy
          </span>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="feedbackStock">Stock Symbol</Label>
            <Input
              id="feedbackStock"
              value={feedbackStock}
              onChange={(e) => setFeedbackStock(e.target.value.toUpperCase())}
              placeholder="Enter symbol"
              data-testid="input-feedback-stock"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="actualPrice">Actual Price (Optional)</Label>
            <Input
              id="actualPrice"
              type="number"
              step="0.01"
              value={actualPrice}
              onChange={(e) => setActualPrice(e.target.value)}
              placeholder="Enter price"
              data-testid="input-actual-price"
            />
          </div>

          <div className="space-y-2">
            <Label>Was it helpful?</Label>
            <Select value={feedbackRating} onValueChange={setFeedbackRating} data-testid="select-feedback-rating">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white opacity-100 shadow-lg border border-gray-200">
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button
              onClick={handleSubmitFeedback}
              disabled={feedbackMutation.isPending}
              className="w-full bg-success hover:bg-green-600 text-white"
              data-testid="button-submit-feedback"
            >
              <Send className="h-4 w-4 mr-2" />
              {feedbackMutation.isPending ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
