import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BullWiserLogo } from "@/components/BullWiserLogo";

export default function VerifyEmailPage() {
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [state, setState] = useState<"checking" | "ok" | "bad">("checking");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!token) { setState("bad"); setMsg("This verification link is not valid."); return; }
    fetch("/api/verify-email", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ token }) })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (r.ok) setState("ok"); else { setState("bad"); setMsg(j.message || "Could not verify your email."); } })
      .catch(() => { setState("bad"); setMsg("Could not reach the server. Please try again."); });
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2"><BullWiserLogo className="w-12 h-12" /></div>
          <CardTitle>{state === "checking" ? "Verifying…" : state === "ok" ? "Email verified ✓" : "Verification failed"}</CardTitle>
          <CardDescription>{state === "ok" ? "Thank you — your email address is confirmed." : state === "bad" ? msg : "Please wait a moment."}</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Link href="/"><Button data-testid="button-verify-continue">Continue to BullWiser</Button></Link>
        </CardContent>
      </Card>
    </div>
  );
}
