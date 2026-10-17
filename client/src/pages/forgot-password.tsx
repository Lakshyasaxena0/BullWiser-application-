import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BullWiserLogo } from "@/components/BullWiserLogo";
import { apiRequest } from "@/lib/queryClient";

// apiRequest throws "<status>: <body>"; show only the server's message
function errorText(e: unknown, fallback: string): string {
  const raw = e instanceof Error ? e.message : "";
  const body = raw.replace(/^\d+:\s*/, "");
  try { const j = JSON.parse(body); if (j?.message) return String(j.message); } catch { /* not JSON */ }
  return body || fallback;
}

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiRequest("POST", "/api/forgot-password", { identifier: identifier.trim() });
      setSent(true);
    } catch (err) {
      setError(errorText(err, "Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white/95 backdrop-blur" data-testid="card-forgot-password">
        <CardHeader className="space-y-1">
          <div className="flex items-center space-x-2 mb-2">
            <BullWiserLogo className="w-10 h-10" />
            <CardTitle className="text-2xl font-bold">Forgot password</CardTitle>
          </div>
          <CardDescription>Enter the email (or username) of your account and we will email you a link to choose a new password.</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4" data-testid="text-reset-sent">
              <div className="p-3 rounded-md bg-green-50 border border-green-200 text-sm text-green-800">
                If an account with that email or username exists, a reset link is on its way. It is valid for 30 minutes. Check your spam folder too.
              </div>
              <Link href="/auth"><Button variant="outline" className="w-full">Back to login</Button></Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="identifier">Email or username</Label>
                <Input id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@example.com" required autoComplete="username" data-testid="input-identifier" />
              </div>
              {error && <p className="text-sm text-red-600" data-testid="text-reset-error">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy || !identifier.trim()} data-testid="button-send-reset">
                {busy ? "Sending..." : "Send reset link"}
              </Button>
              <p className="text-center text-sm"><Link href="/auth" className="text-blue-600 hover:underline">Back to login</Link></p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
