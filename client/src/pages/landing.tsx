import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, TrendingUp, Shield, Zap } from "lucide-react";
import { BullWiserLogo, BullWiserLogoLarge } from "@/components/BullWiserLogo";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";

const CONSENT_KEY = "bullwiser_terms_accepted";
const readConsent = () => { try { return localStorage.getItem(CONSENT_KEY) !== null; } catch { return false; } };

export default function Landing() {
  const [accepted, setAccepted] = useState<boolean>(readConsent);
  const [hint, setHint] = useState(false);
  const toggle = (v: boolean) => {
    setAccepted(v); setHint(false);
    try { v ? localStorage.setItem(CONSENT_KEY, new Date().toISOString()) : localStorage.removeItem(CONSENT_KEY); } catch {}
  };
  // Every "Sign in / Get started" button goes through here: nothing opens until the box is ticked
  const go = () => {
    if (!accepted) {
      setHint(true);
      document.getElementById("consent")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    window.location.href = '/auth';
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Navigation Bar */}
      <nav className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="flex flex-col">
              <div className="flex items-center space-x-2 cursor-pointer" onClick={() => window.location.href = '/'}>
                <BullWiserLogo className="w-10 h-10" />
                <span className="text-2xl font-bold text-white">BullWiser</span>
              </div>
              <span className="text-xs text-gray-300 ml-12">Powered by Faraksh</span>
            </div>
          </div>
          <div className="flex items-center space-x-6">
            <Button 
              onClick={go}
              className="bg-primary hover:bg-primary-light text-white font-semibold px-6 py-2 rounded-lg transition-colors duration-200"
              data-testid="button-login-nav"
            >
              Sign In
            </Button>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="flex items-center justify-center mb-6">
            <BullWiserLogoLarge className="w-20 h-20" />
          </div>
          <h1 className="text-5xl font-bold text-white mb-6">
            Welcome to <span className="text-primary">BullWiser</span>
          </h1>
          <p className="text-xl text-blue-100 max-w-2xl mx-auto mb-8">
            Smart decisions <span className="text-gray-400">•</span> Genuine Profit
          </p>
          <Button 
            onClick={go}
            size="lg"
            className="bg-primary hover:bg-primary-light text-white font-semibold px-8 py-3 rounded-lg text-lg transition-colors duration-200"
            data-testid="button-login"
          >
            Get Started
          </Button>
        </div>

        {/* Features */}
        <div id="features" className="grid md:grid-cols-3 gap-8 mb-16">
          <Card className="bg-white/10 backdrop-blur-sm border-white/20">
            <CardHeader className="text-center">
              <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
              <CardTitle className="text-white">AI Predictions</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-blue-100 text-center">
                Advanced machine learning algorithms analyze market patterns to provide
                accurate stock price predictions with confidence scores.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="bg-white/10 backdrop-blur-sm border-white/20">
            <CardHeader className="text-center">
              <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <CardTitle className="text-white">Risk Management</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-blue-100 text-center">
                Customizable risk levels and portfolio protection strategies to help
                you trade with confidence while minimizing potential losses.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="bg-white/10 backdrop-blur-sm border-white/20">
            <CardHeader className="text-center">
              <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Zap className="h-6 w-6 text-white" />
              </div>
              <CardTitle className="text-white">Real-time Insights</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-blue-100 text-center">
                Live market data, instant notifications, and real-time alerts to
                keep you informed about market movements and trading opportunities.
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* CTA Section */}
        <div id="about" className="text-center">
          <Card className="bg-white/10 backdrop-blur-sm border-white/20 max-w-2xl mx-auto">
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold text-white mb-4">
                Ready to Transform Your Trading?
              </h2>
              <p className="text-blue-100 mb-6">
                Join thousands of traders who are already using BullWiser to make
                smarter investment decisions and maximize their returns.
              </p>
              <div className="bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl p-6 mb-4">
                <Button 
                  onClick={go}
                  className="bg-primary hover:bg-primary-light text-white font-bold px-12 py-4 rounded-lg text-2xl transition-colors duration-200 w-full"
                  data-testid="button-login-cta"
                >
                  Start Trading Smarter
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Consent + Terms & Conditions */}
        <div id="consent" className="mt-10 max-w-3xl mx-auto" data-testid="landing-consent">
          <Card className="bg-white/10 backdrop-blur-sm border-white/20">
            <CardHeader>
              <CardTitle className="text-white text-xl">Consent &amp; Terms and Conditions</CardTitle>
              <CardDescription className="text-blue-100">Please read before you continue.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-64 overflow-y-auto pr-2 text-sm text-blue-100/90 leading-relaxed space-y-3" data-testid="terms-text">
                <p><strong>1. What BullWiser does.</strong> BullWiser only analyses Statistics and Vedic Astrology through Artificial Intelligence to produce predictions for stocks and cryptocurrencies. It is an analysis tool and nothing more.</p>
                <p><strong>2. No buying or selling.</strong> BullWiser does not buy, sell, hold or trade any stock, cryptocurrency or other security for you, does not connect to your broker or exchange account, and never handles your trading funds. Any trade you make is your own decision, made on your own platform.</p>
                <p><strong>3. Not investment advice.</strong> Predictions are for information and education only. BullWiser is not a SEBI-registered investment adviser or research analyst, and nothing here is a recommendation, offer or solicitation to buy or sell.</p>
                <p><strong>4. Your profit and your loss.</strong> You alone are responsible for every profit or loss arising from any decision you take. BullWiser, its owners and its team accept no liability for any loss, direct or indirect.</p>
                <p><strong>5. No guarantee.</strong> Markets are uncertain and can lose capital. Predictions can be wrong, and past or predicted performance does not guarantee future results. Astrology is a belief-based method and has no proven scientific basis for market forecasting.</p>
                <p><strong>6. Data.</strong> Market data comes from third-party providers and can be delayed, incomplete or unavailable. Please do your own research and consider consulting a qualified financial adviser first.</p>
                <p><strong>7. Credits.</strong> Credits are paid for the analysis service. They are not an investment, carry no interest and are not a deposit. Refunds apply only where the service failed to deliver a result.</p>
                <p><strong>8. Eligibility and use.</strong> You confirm you are 18 or older and legally able to accept these terms, and that you will use BullWiser lawfully and only for yourself.</p>
              </div>
              <label className="mt-5 flex items-start gap-3 cursor-pointer" htmlFor="terms-checkbox">
                <Checkbox id="terms-checkbox" checked={accepted} onCheckedChange={(v) => toggle(v === true)} className="mt-0.5 border-white data-[state=checked]:bg-primary" data-testid="checkbox-terms" />
                <span className="text-sm text-white">
                  I have read and agree to the Terms and Conditions. I understand that BullWiser only analyses Statistics and Astrology through AI to give predictions, does not buy or sell anything, and that I am fully responsible for my own profit or loss.
                </span>
              </label>
              {hint && !accepted && (
                <p className="mt-3 text-sm text-red-300" role="alert" data-testid="terms-error">Please tick the box to accept the Terms and Conditions before continuing.</p>
              )}
              <Button onClick={go} disabled={!accepted} className="mt-5 w-full bg-primary hover:bg-primary-light text-white font-semibold" data-testid="button-accept-continue">
                Accept &amp; Continue
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Disclaimer */}
        <div className="mt-10 max-w-3xl mx-auto text-center" data-testid="landing-disclaimer">
          <p className="text-xs text-blue-100/90 leading-relaxed">
            <strong>Disclaimer:</strong> BullWiser is an AI + astrology based stocks &amp; cryptocurrency predicting system.
            Predictions are generated from statistics, artificial intelligence and Vedic astrology for informational and
            educational purposes only. They are not investment advice and not a substitute for a SEBI-registered adviser.
            Stock and crypto markets carry risk, including loss of capital; past or predicted performance does not guarantee
            future results. Please do your own research before investing.
          </p>
        </div>
      </div>
    </div>
  );
}
