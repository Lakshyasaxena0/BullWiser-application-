import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

/** Front-page card: credits left and total credits ever bought. */
export default function CreditsSummary() {
  const { data } = useQuery<{ balance: number; totalPurchased: number; creditRupees: number; creditsRequired: boolean }>({
    queryKey: ["/api/credits/me"],
    refetchInterval: 60000,
  });
  const left = data?.balance ?? 0, bought = data?.totalPurchased ?? 0;
  const pct = bought > 0 ? Math.min(100, Math.round((left / bought) * 100)) : 0;
  return (
    <div className="bg-gray-100 border border-gray-200 rounded-xl p-6 text-gray-800" data-testid="card-credits">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">🪙 Your Credits</h3>
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div><p className="text-xs text-gray-500">Credits left</p><p className="text-2xl font-bold text-gray-900" data-testid="text-credits-left">{data ? left : "…"}</p></div>
        <div><p className="text-xs text-gray-500">Total bought</p><p className="text-2xl font-bold text-gray-900" data-testid="text-credits-bought">{data ? bought : "…"}</p></div>
      </div>
      <div className="w-full bg-gray-300 rounded-full h-2 mb-3"><div className="bg-primary h-2 rounded-full" style={{ width: `${pct}%` }} /></div>
      <p className="text-xs text-gray-500 mb-3">1 credit = ₹{data?.creditRupees ?? 10}{data && !data.creditsRequired ? " · free mode: nothing is deducted yet" : ""}</p>
      <Link href="/plans"><Button className="w-full">Plans &amp; Recharge</Button></Link>
    </div>
  );
}
