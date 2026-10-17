import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { payForPlan } from "@/lib/razorpay";
import { ReferralCard } from "@/components/ReferralCard";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Check, TrendingUp, Shield, Zap } from "lucide-react";

type TradingMode = 'suggestion' | 'auto';
type RiskLevel = 'low' | 'medium' | 'high';
type Duration = 'daily' | 'weekly' | 'monthly' | 'yearly';

interface BillingEstimate {
  mode: string;
  tradeType: string;
  tradesPerDay: number;
  duration: string;
  basePrice: number;
  afterDurationDiscount: number;
  afterReferralDiscount: number;
  autoModeSurcharge: number;
  referralDiscountApplied: number;
  durationDiscountApplied: number;
  finalBill: number;
}

export default function Plans() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Form state
  const [mode, setMode] = useState<TradingMode>('auto');
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('medium');
  const [tradesPerDay, setTradesPerDay] = useState(5);
  const [duration, setDuration] = useState<Duration>('monthly');

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({ title: "Please log in", description: "You need to be logged in to view plans", variant: "destructive" });
      setTimeout(() => { window.location.href = "/api/login"; }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);

  // Fetch current subscriptions
  const { data: subscriptions } = useQuery<any[]>({
    queryKey: ["/api/user/subscriptions"],
    enabled: isAuthenticated,
  });

  // Check if user has active subscription
  const activeSubscription = subscriptions?.find(s => new Date(s.endTs * 1000) > new Date());
  const hasActiveSubscription = !!activeSubscription;

  // Fetch billing estimate
  const { data: estimate, isLoading: estimateLoading } = useQuery<BillingEstimate>({
    queryKey: ["/api/billing/estimate", { mode, tradeType: riskLevel, tradesPerDay, duration }],
    queryFn: async () => {
      const response = await fetch("/api/billing/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, tradeType: riskLevel, tradesPerDay, duration }),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch estimate");
      return response.json();
    },
    enabled: isAuthenticated,
  });

  // Subscribe mutation
  const subscribeMutation = useMutation({
    mutationFn: () =>
      payForPlan({
        kind: "stock",
        plan: { mode, tradeType: riskLevel, tradesPerDay, duration },
        prefill: { name: (user as any)?.username, email: (user as any)?.email },
      }),
    onSuccess: (result) => {
      if (result.status === "cancelled") {
        toast({ title: "Payment cancelled", description: "No money was taken." });
        return;
      }
      toast({
        title: "Payment successful!",
        description: `Your ${mode} plan is now active. Subscription ID: ${result.subscriptionId}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/subscriptions"] });
      setTimeout(() => setLocation('/subscription'), 1500);
    },
    onError: (error: Error) => {
      toast({ title: "Payment failed", description: error.message || "Please try again", variant: "destructive" });
    },
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleSubscribe = () => {
    subscribeMutation.mutate();
  };

  const modeFeatures = {
    suggestion: [
      "AI-powered stock suggestions",
      "Technical analysis insights",
      "Risk assessment",
      "Basic market alerts",
    ],
    auto: [
      "All suggestion features",
      "Automated trading signals",
      "Advanced risk management",
      "Priority market alerts",
      "Portfolio optimization",
    ],
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Subscription Plans</h1>
        <p className="text-gray-600">Choose the perfect plan for your trading needs</p>
      </div>

      {/* Active Subscription Banner */}
      {hasActiveSubscription && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                  <Check className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-green-900">Active Subscription</p>
                  <p className="text-sm text-green-700">
                    {activeSubscription.mode} • {activeSubscription.duration} • 
                    {Math.max(0, Math.ceil((activeSubscription.endTs * 1000 - Date.now()) / (1000 * 60 * 60 * 24)))} days remaining
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={() => setLocation('/subscription')}>
                View Details
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Configure Your Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Trading Mode */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Trading Mode</label>
            <Select value={mode} onValueChange={(v) => setMode(v as TradingMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="suggestion">
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="h-4 w-4" />
                    <span>Suggestion Mode</span>
                  </div>
                </SelectItem>
                <SelectItem value="auto">
                  <div className="flex items-center space-x-2">
                    <Zap className="h-4 w-4" />
                    <span>Auto Mode</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              {mode === 'suggestion' ? 'Get AI recommendations' : 'Automated signals for direct trading'}
            </p>
          </div>

          {/* Risk Level */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Risk Level</label>
            <Select value={riskLevel} onValueChange={(v) => setRiskLevel(v as RiskLevel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">
                  <div className="flex items-center justify-between w-full">
                    <span>🛡️ Balanced (Low Risk)</span>
                  </div>
                </SelectItem>
                <SelectItem value="medium">
                  <div className="flex items-center justify-between w-full">
                    <span>⚖️ Balanced (Medium Risk)</span>
                  </div>
                </SelectItem>
                <SelectItem value="high">
                  <div className="flex items-center justify-between w-full">
                    <span>🚀 Aggressive (High Risk)</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Trades Per Day */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Trades Per Day</label>
            <Select value={tradesPerDay.toString()} onValueChange={(v) => setTradesPerDay(parseInt(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <SelectItem key={num} value={num.toString()}>
                    {num} trades/day
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Billing Period */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Billing Period</label>
            <Select value={duration} onValueChange={(v) => setDuration(v as Duration)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly (5% off)</SelectItem>
                <SelectItem value="monthly">Monthly (10% off)</SelectItem>
                <SelectItem value="yearly">Yearly (20% off)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Plan Features */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Plan Features</label>
            <div className="space-y-2">
              {modeFeatures[mode].map((feature, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <span className="text-sm">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Plan Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {estimateLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : estimate ? (
            <>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Base Price</span>
                  <span className="font-medium">₹{estimate.basePrice.toLocaleString()}</span>
                </div>
                {estimate.durationDiscountApplied > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-green-600">Duration Discount ({estimate.durationDiscountApplied}%)</span>
                    <span className="text-green-600">-₹{(estimate.basePrice - estimate.afterDurationDiscount).toLocaleString()}</span>
                  </div>
                )}
                {estimate.referralDiscountApplied > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-green-600">Referral Discount ({estimate.referralDiscountApplied}%)</span>
                    <span className="text-green-600">-₹{(estimate.afterDurationDiscount - estimate.afterReferralDiscount).toLocaleString()}</span>
                  </div>
                )}
                {estimate.autoModeSurcharge > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Auto Mode Surcharge</span>
                    <span className="font-medium">+₹{estimate.autoModeSurcharge.toLocaleString()}</span>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold">Total</span>
                  <span className="text-2xl font-bold text-primary">₹{estimate.finalBill.toLocaleString()}</span>
                </div>
              </div>

              <div className="pt-4 space-y-2 text-xs text-gray-600">
                <div className="flex justify-between">
                  <span>Mode:</span>
                  <span className="font-medium capitalize">{mode}</span>
                </div>
                <div className="flex justify-between">
                  <span>Risk Level:</span>
                  <span className="font-medium capitalize">{riskLevel}</span>
                </div>
                <div className="flex justify-between">
                  <span>Trades:</span>
                  <span className="font-medium">{tradesPerDay} per day</span>
                </div>
                <div className="flex justify-between">
                  <span>Duration:</span>
                  <span className="font-medium capitalize">{duration}</span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-center text-gray-500">Unable to load estimate</p>
          )}
        </CardContent>
      </Card>

      {/* Mode Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className={mode === 'suggestion' ? 'border-primary' : ''}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5" />
                <CardTitle className="text-lg">Suggestion Mode</CardTitle>
              </div>
              {mode === 'suggestion' && <Badge>Selected</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {modeFeatures.suggestion.map((feature, index) => (
              <div key={index} className="flex items-center space-x-2">
                <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className={mode === 'auto' ? 'border-primary' : ''}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Zap className="h-5 w-5" />
                <CardTitle className="text-lg">Auto Mode</CardTitle>
              </div>
              {mode === 'auto' && <Badge>Selected</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {modeFeatures.auto.map((feature, index) => (
              <div key={index} className="flex items-center space-x-2">
                <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <ReferralCard />

      {/* Subscribe Button */}
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-lg">
                {hasActiveSubscription ? 'Update Your Plan' : 'Start Your Journey'}
              </h3>
              <p className="text-sm text-gray-600">
                {hasActiveSubscription 
                  ? 'Upgrade or modify your current subscription'
                  : 'Get access to AI-powered predictions and market outlook'}
              </p>
            </div>
            <Button
              size="lg"
              className="w-full md:w-auto"
              onClick={handleSubscribe}
              disabled={subscribeMutation.isPending}
            >
              {subscribeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Opening payment...
                </>
              ) : hasActiveSubscription ? (
                `Pay ₹${(estimate?.finalBill ?? 0).toLocaleString('en-IN')} & Update Plan`
              ) : (
                `Pay ₹${(estimate?.finalBill ?? 0).toLocaleString('en-IN')} & Subscribe`
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Disclaimer */}
      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="pt-6">
          <div className="flex items-start space-x-3">
            <Shield className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium mb-1">Investment Disclaimer</p>
              <p className="text-xs">
                BullWiser combines statistical analysis (RSI, MACD, Moving Averages) and Vedic astrology 
                in a 50/50 model. This is not financial advice. Always do your own research before investing. 
                Past performance does not guarantee future results.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
