import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Coins } from "lucide-react";

interface Props { kind: "stock" | "crypto"; symbol: string; when: string; style: string; riskLevel: string }

/** Shows what the prediction will cost BEFORE the user presses the button. */
export function CostPreview({ kind, symbol, when, style, riskLevel }: Props) {
  const { data } = useQuery<any>({
    queryKey: ["/api/credits/quote", kind, symbol, when.slice(0, 10), style, riskLevel],
    queryFn: async () => (await apiRequest("POST", "/api/credits/quote", { kind, symbol, when, style, riskLevel })).json(),
    enabled: !!symbol,
    staleTime: 30000,
  });
  if (!data) return null;
  if (!data.creditsRequired) {
    return <p className="text-xs text-gray-500 flex items-center gap-1"><Coins className="h-3 w-3" /> Free for now — no credits will be deducted.</p>;
  }
  return (
    <div className={`rounded-md border p-3 text-sm ${data.enough ? "bg-blue-50 border-blue-200" : "bg-red-50 border-red-200"}`} data-testid="cost-preview">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 font-medium"><Coins className="h-4 w-4 text-amber-500" /> Cost: {data.credits} credits (₹{data.rupees})</span>
        <span className="text-gray-600">Balance: {data.balance}</span>
      </div>
      <details className="mt-1 text-xs text-gray-600">
        <summary className="cursor-pointer">Why this cost?</summary>
        <ul className="mt-1 space-y-0.5">{data.lines.map((l: any, i: number) => <li key={i} className="flex justify-between"><span>{l.label}</span><span>{l.value}</span></li>)}</ul>
      </details>
      {!data.enough && <p className="mt-1 text-red-700">Not enough credits. <Link href="/plans"><a className="underline font-medium">Recharge now</a></Link></p>}
    </div>
  );
}
