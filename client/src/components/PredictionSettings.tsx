import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ThumbsUp, ThumbsDown } from "lucide-react";

export function PredictionSettings() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: prefs } = useQuery<{ useAi: boolean; useAstro: boolean }>({ queryKey: ["/api/user/preferences"] });
  const { data: preds } = useQuery<any[]>({ queryKey: ["/api/predictions/feedback"] });
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const savePrefs = useMutation({
    mutationFn: async (p: Partial<{ useAi: boolean; useAstro: boolean }>) => (await apiRequest("PUT", "/api/user/preferences", p)).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/user/preferences"] }); qc.invalidateQueries({ queryKey: ["/api/credits/quote"] }); toast({ title: "Saved" }); },
    onError: (e: Error) => toast({ title: "Could not save", description: e.message, variant: "destructive" }),
  });
  const sendFeedback = useMutation({
    mutationFn: async (v: { id: number; rating: 1 | -1 }) => (await apiRequest("POST", `/api/predictions/${v.id}/feedback`, { rating: v.rating, comment: drafts[v.id] || "" })).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/predictions/feedback"] }); toast({ title: "Thanks for the feedback" }); },
    onError: (e: Error) => toast({ title: "Could not send", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Prediction engines</CardTitle>
          <CardDescription>Choose what goes into your predictions. Turning an engine off also lowers the credits a prediction costs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div><p className="font-medium">Astrology</p><p className="text-sm text-gray-500">Vedic planetary signals (45% weight). Off = statistics-only prediction.</p></div>
            <Switch checked={prefs?.useAstro ?? true} disabled={!prefs || savePrefs.isPending} onCheckedChange={(v) => savePrefs.mutate({ useAstro: v })} data-testid="switch-astrology" />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div><p className="font-medium">AI analysis</p><p className="text-sm text-gray-500">AI-written reasoning and adjustment. Off = the built-in rule engine is used.</p></div>
            <Switch checked={prefs?.useAi ?? true} disabled={!prefs || savePrefs.isPending} onCheckedChange={(v) => savePrefs.mutate({ useAi: v })} data-testid="switch-ai" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your feedback on predictions</CardTitle>
          <CardDescription>Tell us whether each prediction was useful. This helps BullWiser improve.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!preds?.length && <p className="text-sm text-gray-500">No predictions yet.</p>}
          {preds?.map((p) => (
            <div key={p.id} className="border rounded-lg p-3 space-y-2" data-testid={`feedback-${p.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{String(p.stock).replace("CRYPTO_", "")}</p>
                  <p className="text-xs text-gray-500">
                    ₹/$ {Number(p.predLow).toLocaleString()} – {Number(p.predHigh).toLocaleString()} · confidence {p.confidence}% · {new Date(p.createdAt).toLocaleDateString("en-IN")}
                    {p.actualPrice ? ` · actual ${Number(p.actualPrice).toLocaleString()}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant={p.rating === 1 ? "default" : "outline"} disabled={sendFeedback.isPending} onClick={() => sendFeedback.mutate({ id: p.id, rating: 1 })}><ThumbsUp className="h-4 w-4" /></Button>
                  <Button size="sm" variant={p.rating === -1 ? "destructive" : "outline"} disabled={sendFeedback.isPending} onClick={() => sendFeedback.mutate({ id: p.id, rating: -1 })}><ThumbsDown className="h-4 w-4" /></Button>
                </div>
              </div>
              <Textarea rows={2} maxLength={1000} placeholder="Optional comment (added when you tap 👍 or 👎)"
                value={drafts[p.id] ?? p.comment ?? ""} onChange={(e) => setDrafts({ ...drafts, [p.id]: e.target.value })} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
