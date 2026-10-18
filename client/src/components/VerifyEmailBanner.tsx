import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MailWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

export default function VerifyEmailBanner() {
  const { data } = useQuery<{ email: string | null; verified: boolean; mailConfigured: boolean }>({ queryKey: ["/api/email/status"], staleTime: 60000 });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!data || data.verified || !data.email) return null;
  const resend = async () => {
    setBusy(true); setNote("");
    try {
      const r = await apiRequest("POST", "/api/email/resend");
      const j = await r.json().catch(() => ({}));
      setNote(r.ok ? "Verification email sent — please check your inbox (and spam)." : j.message || "Could not send the email.");
    } catch (e: any) {
      const m = String(e?.message || "").replace(/^\d+:\s*/, ""); let t = m; try { t = JSON.parse(m).message || m; } catch {}
      setNote(t || "Could not send the email.");
    } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="banner-verify-email">
      <MailWarning className="h-5 w-5 shrink-0" />
      <span className="flex-1 min-w-[200px]">Please verify your email <strong>{data.email}</strong> — it is needed to reset your password and to receive your prediction results.{note && <em className="block mt-1">{note}</em>}</span>
      <Button size="sm" variant="outline" disabled={busy} onClick={resend} data-testid="button-resend-verification">Send verification email</Button>
    </div>
  );
}
