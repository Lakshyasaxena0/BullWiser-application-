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
        {data.practice && (
          <div className="p-3 bg-blue-50 rounded-lg space-y-1" data-testid="learning-practice">
            <p className="text-sm font-semibold">Self-practice</p>
            <p className="text-xs text-gray-600">
              Every hour BullWiser also makes its own predictions on {data.practice.watching.stocks} stocks and {data.practice.watching.crypto} coins (while the market is open for stocks) and checks them against the real price.
              So far: {data.practice.made} made · {data.practice.scored} checked{data.practice.accuracyPct !== null && <> · {data.practice.accuracyPct}% direction right{data.practice.baselinePct !== null && <> (always guessing the most common outcome would score {data.practice.baselinePct}%, so the real edge is {data.practice.edgePct > 0 ? '+' : ''}{data.practice.edgePct} points)</>}</>} · {data.practice.waitingForResult} waiting for their result.
            </p>
          </div>
        )}
        <div className="grid md:grid-cols-2 gap-3">{block("Stocks", data.stock)}{block("Crypto", data.crypto)}</div>
      </CardContent>
    </Card>
  );
}
