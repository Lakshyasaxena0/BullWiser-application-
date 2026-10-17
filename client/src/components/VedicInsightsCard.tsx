import { Badge } from "@/components/ui/badge";

interface Vedic {
  sectors: string[];
  sectorScore: number;
  score: number;
  bias: "bullish" | "bearish" | "neutral";
  reasons: string[];
  highlights: { retrograde: string[]; combust: string[]; mrituBhaga: string[]; exchanges: string[]; strong: string[]; weak: string[] };
}

const biasStyle = { bullish: "bg-green-100 text-green-800", bearish: "bg-red-100 text-red-800", neutral: "bg-gray-100 text-gray-800" } as const;

export default function VedicInsightsCard({ vedic }: { vedic?: Vedic | null }) {
  if (!vedic) return null;
  const h = vedic.highlights;
  const chips: { label: string; items: string[] }[] = [
    { label: "Retrograde", items: h.retrograde },
    { label: "Combust (asta)", items: h.combust },
    { label: "Mritu bhaga", items: h.mrituBhaga },
    { label: "Strong", items: h.strong },
    { label: "Weak", items: h.weak },
  ].filter(c => c.items.length);
  return (
    <div className="p-4 bg-white border border-amber-300 rounded-lg space-y-2" data-testid="card-vedic-insights">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-gray-900">Vedic Astro Insights</p>
        <Badge className={biasStyle[vedic.bias]}>{vedic.bias} ({vedic.score >= 0 ? "+" : ""}{vedic.score.toFixed(2)})</Badge>
      </div>
      {vedic.sectors.length > 0 && (
        <p className="text-xs text-gray-600">Karaka sector: <span className="font-medium">{vedic.sectors.join(", ")}</span></p>
      )}
      {chips.map(c => (
        <p key={c.label} className="text-xs text-gray-700"><span className="font-medium">{c.label}:</span> {c.items.join(", ")}</p>
      ))}
      {h.exchanges.map(e => <p key={e} className="text-xs text-gray-700">Exchange (parivartana): {e}</p>)}
      {vedic.reasons.length > 0 && (
        <ul className="text-xs text-gray-600 list-disc pl-4 space-y-0.5">{vedic.reasons.slice(0, 5).map(r => <li key={r}>{r}</li>)}</ul>
      )}
      <p className="text-[11px] text-gray-400">Sidereal (Lahiri) positions; informational only.</p>
    </div>
  );
}
