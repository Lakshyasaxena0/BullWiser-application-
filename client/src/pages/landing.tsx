import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, TrendingUp, Shield, Zap } from "lucide-react";
import { BullWiserLogo, BullWiserLogoLarge } from "@/components/BullWiserLogo";

export default function Landing() {
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
              onClick={() => window.location.href = '/auth'}
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
            onClick={() => window.location.href = '/auth'}
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
                  onClick={() => window.location.href = '/auth'}
                  className="bg-primary hover:bg-primary-light text-white font-bold px-12 py-4 rounded-lg text-2xl transition-colors duration-200 w-full"
                  data-testid="button-login-cta"
                >
                  Start Trading Smarter
                </Button>
              </div>
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
