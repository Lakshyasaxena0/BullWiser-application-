import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BullWiserLogo } from "@/components/BullWiserLogo";
import { apiRequest } from "@/lib/queryClient";

function errorText(e: unknown, fallback: string): string {
  const raw = e instanceof Error ? e.message : "";
  const body = raw.replace(/^\d+:\s*/, "");
  try { const j = JSON.parse(body); if (j?.message) return String(j.message); } catch { /* not JSON */ }
  return body || fallback;
}

export default function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [linkOk, setLinkOk] = useState<boolean | null>(null);   // null = checking
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) { setLinkOk(false); return; }
    apiRequest("GET", `/api/reset-password/check?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => setLinkOk(!!d?.valid))
      .catch(() => setLinkOk(false));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) return setError("Password must be at least 6 characters");
    if (password !== confirm) return setError("Passwords do not match");
    setBusy(true);
    try {
      await apiRequest("POST", "/api/reset-password", { token, password });
      setDone(true);
    } catch (err) {
      setError(errorText(err, "Could not reset the password. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white/95 backdrop-blur" data-testid="card-reset-password">
        <CardHeader className="space-y-1">
          <div className="flex items-center space-x-2 mb-2">
            <BullWiserLogo className="w-10 h-10" />
            <CardTitle className="text-2xl font-bold">Choose a new password</CardTitle>
          </div>
          <CardDescription>Pick a password you have not used before.</CardDescription>
        </CardHeader>
        <CardContent>
          {linkOk === null ? (
            <p className="text-sm text-gray-500">Checking your link...</p>
          ) : done ? (
            <div className="space-y-4" data-testid="text-reset-done">
              <div className="p-3 rounded-md bg-green-50 border border-green-200 text-sm text-green-800">
                Your password has been updated. Please log in with the new password.
              </div>
              <Link href="/auth"><Button className="w-full">Go to login</Button></Link>
            </div>
          ) : !linkOk ? (
            <div className="space-y-4" data-testid="text-reset-invalid">
              <div className="p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-800">
                This reset link is invalid or has expired. Links work once and last 30 minutes.
              </div>
              <Link href="/forgot-password"><Button className="w-full">Request a new link</Button></Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <PasswordInput id="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
                  minLength={6} required autoComplete="new-password" placeholder="Minimum 6 characters" data-testid="input-new-password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <PasswordInput id="confirm-password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  minLength={6} required autoComplete="new-password" placeholder="Re-enter your password" data-testid="input-confirm-password" />
              </div>
              {error && <p className="text-sm text-red-600" data-testid="text-reset-error">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy} data-testid="button-reset-password">
                {busy ? "Saving..." : "Update password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
