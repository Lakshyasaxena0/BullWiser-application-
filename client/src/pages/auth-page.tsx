import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { TrendingUp, Shield, Zap } from "lucide-react";
import { BullWiserLogo } from "@/components/BullWiserLogo";
import { useLocation, Link } from "wouter";

export default function AuthPage() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("login");

  // Friend's referral link: /auth?ref=CODE  → open the Register tab with the code filled in
  const [referralCode, setReferralCode] = useState("");
  const [referralValid, setReferralValid] = useState<boolean | null>(null);
  useEffect(() => {
    let code = "";
    try { code = new URLSearchParams(window.location.search).get("ref") || sessionStorage.getItem("bw_ref") || ""; } catch { /* storage blocked */ }
    code = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
    if (code) {
      try { sessionStorage.setItem("bw_ref", code); } catch { /* ignore */ }
      setReferralCode(code);
      setActiveTab("register");
    }
  }, []);
  useEffect(() => {
    if (referralCode.length < 4) { setReferralValid(null); return; }
    const t = setTimeout(() => {
      fetch(`/api/referrals/validate?code=${encodeURIComponent(referralCode)}`)
        .then((r) => r.json()).then((j) => setReferralValid(Boolean(j?.valid))).catch(() => setReferralValid(null));
    }, 400);
    return () => clearTimeout(t);
  }, [referralCode]);

  if (!isLoading && isAuthenticated) {
    setLocation("/");
    return null;
  }

  const loginMutation = useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      const res = await apiRequest("POST", "/api/login", credentials);
      return await res.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/user"], user);
      toast({ title: "Welcome back!", description: "You have successfully logged in." });
      setLocation("/");
    },
    onError: () => {
      toast({ title: "Login failed", description: "Invalid username or password.", variant: "destructive" });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (userData: {
      username: string; password: string; confirmPassword: string;
      email?: string; firstName?: string; lastName?: string; referralCode?: string;
    }) => {
      const res = await apiRequest("POST", "/api/register", userData);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Registration failed");
      }
      return await res.json();
    },
    onSuccess: (user) => {
      try { sessionStorage.removeItem("bw_ref"); } catch { /* ignore */ }
      queryClient.setQueryData(["/api/auth/user"], user);
      toast({ title: "Account created!", description: "Your account has been successfully created." });
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({ title: "Registration failed", description: error.message, variant: "destructive" });
    },
  });

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    loginMutation.mutate({
      username: formData.get("username") as string,
      password: formData.get("password") as string,
    });
  };

  const handleRegister = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    registerMutation.mutate({
      username: formData.get("username") as string,
      password: formData.get("password") as string,
      confirmPassword: formData.get("confirmPassword") as string,
      email: formData.get("email") as string,
      firstName: formData.get("firstName") as string,
      lastName: formData.get("lastName") as string,
      referralCode: referralCode || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl grid lg:grid-cols-2 gap-8">
        <Card className="bg-white/95 backdrop-blur">
          <CardHeader className="space-y-1">
            <div className="flex items-center space-x-2 mb-4">
              <BullWiserLogo className="w-10 h-10" />
              <CardTitle className="text-2xl font-bold">BullWiser</CardTitle>
            </div>
            <CardDescription>Enter your credentials to access your account</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-username">Username</Label>
                    <Input id="login-username" name="username" type="text" placeholder="Enter your username" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <PasswordInput id="login-password" name="password" placeholder="Enter your password" required />
                  </div>
                  <div className="text-right -mt-2">
                    <Link href="/forgot-password" className="text-sm text-blue-600 hover:underline" data-testid="link-forgot-password">Forgot password?</Link>
                  </div>
                  <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                    {loginMutation.isPending ? "Logging in..." : "Login"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input id="firstName" name="firstName" type="text" placeholder="John" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input id="lastName" name="lastName" type="text" placeholder="Doe" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-username">Username *</Label>
                    <Input id="register-username" name="username" type="text" placeholder="Choose a username" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input id="email" name="email" type="email" placeholder="john@example.com" required />
                    <p className="text-xs text-gray-500">Used to reset your password if you forget it.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-password">Password *</Label>
                    <PasswordInput id="register-password" name="password" placeholder="Minimum 6 characters" required minLength={6} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password *</Label>
                    <PasswordInput id="confirmPassword" name="confirmPassword" placeholder="Re-enter your password" required minLength={6} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="referral-code">Referral code (optional)</Label>
                    <Input
                      id="referral-code"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16))}
                      placeholder="Friend's code"
                      autoComplete="off"
                    />
                    {referralValid === true && <p className="text-xs text-green-600">✓ Code accepted — your friend gets a reward when you make your first payment.</p>}
                    {referralValid === false && <p className="text-xs text-red-600">This code was not found. You can still sign up without it.</p>}
                  </div>
                  <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                    {registerMutation.isPending ? "Creating account..." : "Create Account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="hidden lg:flex flex-col justify-center space-y-6">
          <div className="text-white space-y-4">
            <h1 className="text-4xl font-bold">Welcome to BullWiser</h1>
            <p className="text-lg text-blue-100">Advanced AI-powered stock prediction platform with real-time NSE/BSE market analysis</p>
          </div>
          <div className="space-y-4">
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-white font-semibold">AI-Powered Predictions</h3>
                <p className="text-blue-100 text-sm">Advanced algorithms analyze market patterns with real-time NSE/BSE data</p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-white font-semibold">Secure & Reliable</h3>
                <p className="text-blue-100 text-sm">Your data is protected with industry-standard encryption</p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-white font-semibold">Real-time Insights</h3>
                <p className="text-blue-100 text-sm">Live market data and instant alerts for trading opportunities</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
