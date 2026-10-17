import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bitcoin, Check, TrendingUp, Shield, Zap, ChevronLeft } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { payForPlan } from "@/lib/razorpay";
import { ReferralCard } from "@/components/ReferralCard";
import { useLocation } from "wouter";

export default function CryptoPlans() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [selectedPlan, setSelectedPlan] = useState({
    mode: 'suggestion',
    tradesPerDay: 5,
    cryptoValue: 50000,
    duration: 'monthly'
  });

  // Get current subscriptions
  const { data: payConfig } = useQuery<{ enabled: boolean; paywall: boolean }>({ queryKey: ["/api/payments/config"] });
  const paymentsEnabled = payConfig?.enabled !== false;
  const { data: subscriptions } = useQuery<any[]>({
    queryKey: ["/api/user/subscriptions"],
    enabled: isAuthenticated,
  });

  // Get crypto billing estimate (apiRequest returns a raw Response, so parse it)
  const { data: estimate } = useQuery<any>({
    queryKey: ["/api/billing/crypto/estimate", selectedPlan],
    queryFn: async () => {
      const res = await apiRequest('POST', '/api/billing/crypto/estimate', selectedPlan);
      return await res.json();
    },
  });

  // Subscribe mutation
  const subscribeMutation = useMutation({
    mutationFn: (planData: any) =>
      payForPlan({
        kind: "crypto",
        plan: planData,
        prefill: { name: (user as any)?.username, email: (user as any)?.email },
      }),
    onSuccess: (result) => {
      if (result.status === "cancelled") {
        toast({ title: "Payment cancelled", description: "No money was taken." });
        return;
      }
      toast({
        title: "Payment successful!",
        description: "Your crypto trading plan is now active.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/subscriptions"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Payment failed",
        description: error.message || "There was an error processing your payment.",
        variant: "destructive",
      });
    },
  });

  const activeCryptoSubscription = subscriptions?.find(
    sub => sub.mode.includes('crypto') && new Date(sub.endTs * 1000) > new Date()
  );

  const planFeatures = {
    suggestion: [
      "AI-powered crypto predictions",
      "Real-time market analysis",
      "Technical indicators",
      "Risk assessment alerts",
      "Portfolio tracking"
    ],
    auto: [
      "All suggestion features",
      "Automated trading signals",
      "Advanced risk management",
      "Priority market alerts",
      "24/7 monitoring",
      "Instant notifications"
    ]
  };

  const cryptoValueTiers = [
    { value: 10000, label: "₹10,000 - Starter" },
    { value: 25000, label: "₹25,000 - Basic" },
    { value: 50000, label: "₹50,000 - Standard" },
    { value: 100000, label: "₹1,00,000 - Premium" },
    { value: 250000, label: "₹2,50,000 - Pro" },
    { value: 500000, label: "₹5,00,000 - Elite" }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation('/cryptocurrencies')}
            className="flex items-center"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Crypto
          </Button>
          <div className="border-l pl-4">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              <Bitcoin className="h-6 w-6 mr-2 text-orange-500" />
              Crypto Trading Plans
            </h1>
            <p className="text-gray-600">Choose the perfect plan for cryptocurrency trading</p>
          </div>
        </div>
      </div>

      <ReferralCard />

      {/* Current Plan Status */}
      {activeCryptoSubscription && (
        <Card className="border-orange-500 bg-orange-50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Bitcoin className="h-6 w-6 text-orange-500" />
                <div>
                  <CardTitle className="text-orange-700">Active Crypto Plan</CardTitle>
                  <p className="text-gray-600">
                    {activeCryptoSubscription.mode} • {activeCryptoSubscription.tradesPerDay} trades/day
                  </p>
                </div>
              </div>
              <Badge className="bg-green-100 text-green-800">Active</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600">Price</p>
                <p className="text-lg font-semibold">₹{activeCryptoSubscription.price}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Duration</p>
                <p className="text-lg font-semibold">{activeCryptoSubscription.duration}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Expires</p>
                <p className="text-lg font-semibold">
                  {new Date(activeCryptoSubscription.endTs * 1000).toLocaleDateString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Plan Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Configure Your Crypto Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Mode Selection */}
            <div>
              <label className="text-sm font-medium mb-2 block">Trading Mode</label>
              <Select value={selectedPlan.mode} onValueChange={(value) => setSelectedPlan({...selectedPlan, mode: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="suggestion">Suggestion Mode</SelectItem>
                  <SelectItem value="auto">Auto Mode (50% Premium)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                {selectedPlan.mode === 'auto' ? 'Automated crypto trading signals' : 'AI-powered crypto recommendations'}
              </p>
            </div>

            {/* Crypto Value */}
            <div>
              <label className="text-sm font-medium mb-2 block">Expected Crypto Portfolio Value</label>
              <Select 
                value={selectedPlan.cryptoValue.toString()} 
                onValueChange={(value) => setSelectedPlan({...selectedPlan, cryptoValue: parseInt(value)})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {cryptoValueTiers.map(tier => (
                    <SelectItem key={tier.value} value={tier.value.toString()}>
                      {tier.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                Higher portfolio values get better multipliers
              </p>
            </div>

            {/* Trades Per Day */}
            <div>
              <label className="text-sm font-medium mb-2 block">Crypto Trades Per Day</label>
              <Select 
                value={selectedPlan.tradesPerDay.toString()} 
                onValueChange={(value) => setSelectedPlan({...selectedPlan, tradesPerDay: parseInt(value)})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2 trades/day</SelectItem>
                  <SelectItem value="5">5 trades/day</SelectItem>
                  <SelectItem value="10">10 trades/day</SelectItem>
                  <SelectItem value="20">20 trades/day</SelectItem>
                  <SelectItem value="50">50 trades/day</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                ₹50 per trade per day
              </p>
            </div>

            {/* Duration */}
            <div>
              <label className="text-sm font-medium mb-2 block">Billing Period</label>
              <Select value={selectedPlan.duration} onValueChange={(value) => setSelectedPlan({...selectedPlan, duration: value})}>
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

            {/* Features */}
            <div>
              <h4 className="font-medium mb-3">Plan Features</h4>
              <div className="space-y-2">
                {planFeatures[selectedPlan.mode as keyof typeof planFeatures].map((feature, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <Check className="h-4 w-4 text-green-600" />
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pricing & Checkout */}
        <Card>
          <CardHeader>
            <CardTitle>Crypto Plan Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {!estimate ? (
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg space-y-3">
                  <div className="animate-pulse space-y-3">
                    <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-300 rounded w-1/2"></div>
                    <div className="h-4 bg-gray-300 rounded w-2/3"></div>
                  </div>
                </div>
                <div className="text-center text-gray-500">
                  Calculating crypto plan pricing...
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-orange-50 rounded-lg space-y-3 border border-orange-200">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">Base Price</span>
                    <span className="font-semibold">₹{estimate.basePrice}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">Trade Cost ({estimate.tradesPerDay} × ₹50)</span>
                    <span className="font-semibold">₹{estimate.tradePrice}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">Value Multiplier (₹{estimate.cryptoValue?.toLocaleString()})</span>
                    <span className="font-semibold text-blue-600">×{estimate.valueMultiplier}</span>
                  </div>

                  {estimate.modeMultiplier > 1 && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">Auto Mode Premium</span>
                      <span className="font-semibold text-purple-600">×{estimate.modeMultiplier}</span>
                    </div>
                  )}

                  {estimate.durationDiscountApplied > 0 && (
                    <div className="flex justify-between items-center text-green-600">
                      <span>Duration Discount ({estimate.durationDiscountApplied}%)</span>
                      <span className="font-semibold">-₹{estimate.subtotal - estimate.afterDurationDiscount}</span>
                    </div>
                  )}

                  {estimate.referralDiscountApplied > 0 && (
                    <div className="flex justify-between items-center text-green-600">
                      <span>Referral Discount ({estimate.referralDiscountApplied}%)</span>
                      <span className="font-semibold">-₹{estimate.afterDurationDiscount - estimate.afterReferralDiscount}</span>
                    </div>
                  )}

                  {estimate.autoModeSurcharge > 0 && (
                    <div className="flex justify-between items-center text-red-600">
                      <span>Auto Mode Surcharge (Risk Premium)</span>
                      <span className="font-semibold">+₹{estimate.autoModeSurcharge}</span>
                    </div>
                  )}

                  <hr className="border-orange-300" />
                  <div className="flex justify-between items-center font-bold text-lg">
                    <span className="text-gray-800">Total Amount</span>
                    <span className="text-orange-600">₹{estimate.finalBill}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-gray-600">Mode</div>
                    <div className="font-semibold capitalize">{selectedPlan.mode}</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-gray-600">Duration</div>
                    <div className="font-semibold capitalize">{selectedPlan.duration}</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-gray-600">Crypto Value</div>
                    <div className="font-semibold">₹{selectedPlan.cryptoValue.toLocaleString()}</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-gray-600">Daily Trades</div>
                    <div className="font-semibold">{selectedPlan.tradesPerDay}</div>
                  </div>
                </div>

                <Button
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3"
                  size="lg"
                  onClick={() => subscribeMutation.mutate(selectedPlan)}
                  disabled={subscribeMutation.isPending || !!activeCryptoSubscription || !paymentsEnabled}
                >
                  {subscribeMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Opening payment...
                    </>
                  ) : !paymentsEnabled ? (
                    "Payments coming soon"
                  ) : activeCryptoSubscription ? (
                    "✓ Crypto Plan Active"
                  ) : (
                    `Pay ₹${(estimate?.finalBill ?? 0).toLocaleString('en-IN')} & Subscribe`
                  )}
                </Button>

                {activeCryptoSubscription && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-700 text-center">
                      ✓ You have an active crypto subscription. New plans will be available after expiry.
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pricing Explanation */}
      <Card>
        <CardHeader>
          <CardTitle>Crypto Billing Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <h4 className="font-medium text-orange-600">Base Price</h4>
              <p className="text-2xl font-bold">₹500</p>
              <p className="text-sm text-gray-500">Fixed base cost</p>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <h4 className="font-medium text-blue-600">Per Trade</h4>
              <p className="text-2xl font-bold">₹50</p>
              <p className="text-sm text-gray-500">Per trade per day</p>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <h4 className="font-medium text-purple-600">Value Multiplier</h4>
              <p className="text-2xl font-bold">Per ₹1K</p>
              <p className="text-sm text-gray-500">Portfolio value based</p>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <h4 className="font-medium text-green-600">Auto Premium</h4>
              <p className="text-2xl font-bold">+50%</p>
              <p className="text-sm text-gray-500">Auto mode surcharge</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
