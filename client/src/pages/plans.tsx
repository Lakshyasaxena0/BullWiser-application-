import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Coins, Loader2, Sparkles, Info } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { payForCredits } from "@/lib/razorpay";
import { ReferralCard } from "@/components/ReferralCard";

interface CreditsInfo {
  balance: number; creditRupees: number; packs: { credits: number; rupees: number }[];
  looseMin: number; looseMax: number; creditsRequired: boolean; paymentsEnabled: boolean;
  history: { id: number; delta: number; balanceAfter: number; kind: string; description: string; createdAt: string }[];
}

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export default function PlansPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loose, setLoose] = useState("");
  const [buying, setBuying] = useState<number | null>(null);

  // cost calculator
  const [calc, setCalc] = useState({ kind: "stock", style: "suggestion", riskLevel: "medium", days: "30" });

  const { data } = useQuery<CreditsInfo>({ queryKey: ["/api/credits/me"] });

  const { data: quote } = useQuery<any>({
    queryKey: ["/api/credits/quote", calc],
    queryFn: async () => {
      const when = new Date(Date.now() + Number(calc.days) * 86400000).toISOString();
      const res = await apiRequest("POST", "/api/credits/quote", { kind: calc.kind, symbol: calc.kind === "stock" ? "TCS" : "BTC", when, style: calc.style, riskLevel: calc.riskLevel });
      return res.json();
    },
  });

  const buy = useMutation({
    mutationFn: (credits: number) => payForCredits(credits, { name: user?.firstName || undefined, email: user?.email || undefined }),
    onMutate: (credits) => setBuying(credits),
    onSettled: () => setBuying(null),
    onSuccess: (r) => {
      if (r.status === "success") {
        toast({ title: "Credits added 🎉", description: `+${r.credits} credits. New balance: ${r.balance}.` });
        queryClient.invalidateQueries({ queryKey: ["/api/credits/me"] });
        setLoose("");
      }
    },
    onError: (e: Error) => toast({ title: "Payment problem", description: e.message, variant: "destructive" }),
  });

  const looseNum = Number(loose);
  const looseValid = data ? Number.isInteger(looseNum) && looseNum >= data.looseMin && looseNum <= data.looseMax : false;
  const canPay = !!data?.paymentsEnabled;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Plans &amp; Recharge</h1>
        <p className="text-sm text-gray-600">BullWiser works on credits. Buy credits, then use them for predictions — 1 credit = ₹{data?.creditRupees ?? 10}.</p>
      </div>

      <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-0">
        <CardContent className="p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm opacity-80">Your balance</p>
            <p className="text-4xl font-bold flex items-center gap-2" data-testid="text-credit-balance"><Coins className="h-8 w-8" /> {data?.balance ?? "…"} <span className="text-lg font-normal opacity-80">credits</span></p>
            {data && <p className="text-sm opacity-80 mt-1">≈ {rupees(data.balance * data.creditRupees)}</p>}
          </div>
          {data && !data.creditsRequired && (
            <Badge className="bg-white/20 text-white">Free mode — no credits are deducted right now</Badge>
          )}
          {data && data.creditsRequired && data.balance < 5 && (
            <Badge className="bg-amber-400 text-black">Low balance — recharge to keep predicting</Badge>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-amber-500" /> Buy credits</CardTitle>
          <CardDescription>Pick a pack, or buy exactly as many as you need below.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {(data?.packs ?? []).map((p) => (
              <button key={p.credits} disabled={!canPay || buy.isPending}
                onClick={() => buy.mutate(p.credits)}
                className="rounded-lg border-2 border-gray-200 p-4 text-left hover:border-primary hover:bg-blue-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid={`button-pack-${p.credits}`}>
                <p className="text-2xl font-bold flex items-center gap-1"><Coins className="h-5 w-5 text-amber-500" />{p.credits}</p>
                <p className="text-gray-600">{rupees(p.rupees)}</p>
                <p className="text-xs text-primary mt-2">{buying === p.credits ? "Opening payment…" : canPay ? "Buy now" : "Payments coming soon"}</p>
              </button>
            ))}
          </div>

          <div className="border-t pt-4">
            <Label htmlFor="loose">Loose buy — any amount</Label>
            <div className="flex flex-wrap items-end gap-3 mt-2">
              <div>
                <Input id="loose" type="number" inputMode="numeric" min={data?.looseMin} max={data?.looseMax} step={1} value={loose}
                  onChange={(e) => setLoose(e.target.value)} placeholder={`e.g. 50 (min ${data?.looseMin ?? 10})`} className="w-48" data-testid="input-loose-credits" />
              </div>
              <div className="text-sm text-gray-600 pb-2 min-w-[90px]">{looseValid ? `= ${rupees(looseNum * (data?.creditRupees ?? 10))}` : ""}</div>
              <Button disabled={!looseValid || !canPay || buy.isPending} onClick={() => buy.mutate(looseNum)} data-testid="button-buy-loose">
                {buy.isPending && buying === looseNum ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {canPay ? "Buy credits" : "Payments coming soon"}
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">Whole numbers only, {data?.looseMin ?? 10} to {data?.looseMax?.toLocaleString("en-IN") ?? "10,000"} credits.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How many credits will a prediction use?</CardTitle>
          <CardDescription>
            The cost depends on the prediction style, risk level, how far ahead it looks, which engines are on (statistics, astrology, AI) and how big the possible move is.
            You always see the exact cost before you press Predict.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1"><Label>Asset</Label>
              <Select value={calc.kind} onValueChange={(v) => setCalc({ ...calc, kind: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="stock">Stock</SelectItem><SelectItem value="crypto">Crypto</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Style</Label>
              <Select value={calc.style} onValueChange={(v) => setCalc({ ...calc, style: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="suggestion">AI + Astro suggestion</SelectItem><SelectItem value="auto">Auto-trading signal</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Risk</Label>
              <Select value={calc.riskLevel} onValueChange={(v) => setCalc({ ...calc, riskLevel: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Looks ahead</Label>
              <Select value={calc.days} onValueChange={(v) => setCalc({ ...calc, days: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="1">1 day</SelectItem><SelectItem value="7">1 week</SelectItem><SelectItem value="30">1 month</SelectItem><SelectItem value="90">3 months</SelectItem><SelectItem value="180">6 months</SelectItem><SelectItem value="365">1 year</SelectItem></SelectContent></Select></div>
          </div>
          {quote && (
            <div className="rounded-lg bg-gray-50 border p-4" data-testid="cost-breakdown">
              <ul className="text-sm space-y-1">
                {quote.lines.map((l: any, i: number) => (<li key={i} className="flex justify-between gap-4"><span className="text-gray-600">{l.label}</span><span className="font-mono">{l.value}</span></li>))}
              </ul>
              <div className="flex justify-between border-t mt-3 pt-3 font-semibold"><span>Total</span><span>{quote.credits} credits ({rupees(quote.rupees)})</span></div>
              <p className="text-xs text-gray-500 mt-2 flex gap-1"><Info className="h-3 w-3 mt-0.5 shrink-0" /> Switching AI or astrology off in Settings lowers the cost. Failed predictions are refunded automatically.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <ReferralCard />

      <Card>
        <CardHeader><CardTitle>Credit history</CardTitle></CardHeader>
        <CardContent>
          {!data?.history?.length ? <p className="text-sm text-gray-500">No activity yet.</p> : (
            <div className="divide-y">
              {data.history.map((h) => (
                <div key={h.id} className="py-2 flex items-center justify-between text-sm">
                  <div><p>{h.description}</p><p className="text-xs text-gray-500">{new Date(h.createdAt).toLocaleString("en-IN")}</p></div>
                  <div className="text-right"><p className={h.delta > 0 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>{h.delta > 0 ? "+" : ""}{h.delta}</p><p className="text-xs text-gray-500">bal {h.balanceAfter}</p></div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
