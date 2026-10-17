import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SelfLearningCard() {
  const { data } = useQuery<any>({ queryKey: ["/api/learning/summary"] });
  if (!data) return null;
  const block = (title: string, p: any) => (
    <div className="p-3 bg-gray-50 rounded-lg space-y-1" data-testid={`learning-${title}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-gray-600">Weights now: {p.weights.statistical}% statistics / {p.weights.astrological}% astrology · {p.samples.global} checked predictions</p>
      {p.hasData && (
        <p className="text-xs text-gray-600">
          Hit-rate — statistics {p.reliability.statistics}%, astrology {p.reliability.astrology}%, final {p.reliability.final}%
          {p.coverage !== null && <> · actual price inside range {p.coverage}%</>}
        </p>
      )}
      <p className="text-[11px] text-gray-500 whitespace-pre-line">{p.summary}</p>
    </div>
  );
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">🧠 Self-learning report</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-gray-600">Every {data.checkedEvery} the system compares each past prediction with the real price, then adjusts its own weights, confidence and price ranges. Starting ratio: {data.baseRatio}.</p>
        <div className="grid md:grid-cols-2 gap-3">{block("Stocks", data.stock)}{block("Crypto", data.crypto)}</div>
      </CardContent>
    </Card>
  );
}
