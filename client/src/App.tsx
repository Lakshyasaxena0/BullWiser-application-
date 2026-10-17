import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import MobileDashboard from "@/pages/mobile-dashboard";
import Predictions from "@/pages/predictions";
import Portfolio from "@/pages/portfolio";
import SubscriptionPage from "@/pages/subscription";
import Notifications from "@/pages/notifications";
import Plans from "@/pages/plans";
import AuthPage from "@/pages/auth-page";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import SettingsPage from "@/pages/settings";
import NotFound from "@/pages/not-found";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import ActivitiesPage from "@/pages/activities";
import TradingHistoryPage from "@/pages/trading-history";
import CryptoPlans from "./pages/crypto-plans";
import MarketOutlook from "@/pages/market-outlook";
import PredictionAnalytics from "@/pages/prediction-analytics"; // ★ NEW

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();
  const [isMobile, setIsMobile] = useState(false);
  const [authTimedOut, setAuthTimedOut] = useState(false);

  useEffect(() => {
    if (!isLoading) return;
    const timer = setTimeout(() => setAuthTimedOut(true), 5000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Password-reset pages work whether or not someone is logged in (the link comes from an email)
  if (location === "/forgot-password" || location === "/reset-password") {
    return (
      <Switch>
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
      </Switch>
    );
  }

  if (isLoading && !authTimedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/auth" component={AuthPage} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  if (isMobile) {
    return (
      <Switch>
        <Route path="/" component={MobileDashboard} />
        <Route path="/dashboard" component={MobileDashboard} />
        <Route path="/predictions" component={Predictions} />
        <Route path="/portfolio" component={Portfolio} />
        <Route path="/subscription" component={SubscriptionPage} />
        <Route path="/notifications" component={Notifications} />
        <Route path="/market-outlook" component={MarketOutlook} />
        <Route path="/prediction-analytics" component={PredictionAnalytics} /> {/* ★ NEW */}
        <Route path="/settings" component={SettingsPage} />
        <Route path="/plans" component={Plans} />
        <Route path="/activities" component={ActivitiesPage} />
        <Route path="/activities/:id" component={ActivitiesPage} />
        <Route path="/trading-history" component={TradingHistoryPage} />
        <Route path="/crypto-plans" component={CryptoPlans} />
        {/* The bottom nav links to these; they used to be 404s on phones */}
        <Route path="/cryptocurrencies"><Redirect to="/trading-history" /></Route>
        <Route path="/history"><Redirect to="/trading-history" /></Route>
        <Route path="/profile"><Redirect to="/settings" /></Route>
        <Route path="/auth" component={AuthPage} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 transition-all duration-300 ease-in-out lg:ml-64" id="main-content">
        <Header />
        <main className="p-6 space-y-6 overflow-y-auto h-full bg-gray-50">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/predictions" component={Predictions} />
            <Route path="/portfolio" component={Portfolio} />
            <Route path="/subscription" component={SubscriptionPage} />
            <Route path="/settings" component={SettingsPage} />
            <Route path="/notifications" component={Notifications} />
            <Route path="/auth" component={AuthPage} />
            <Route path="/plans" component={Plans} />
            <Route path="/activities" component={ActivitiesPage} />
            <Route path="/activities/:id" component={ActivitiesPage} />
            <Route path="/trading-history" component={TradingHistoryPage} />
            <Route path="/market-outlook" component={MarketOutlook} />
            <Route path="/prediction-analytics" component={PredictionAnalytics} /> {/* ★ NEW */}
            <Route path="/cryptocurrencies">
              <Redirect to="/trading-history" />
            </Route>
            <Route path="/crypto-plans" component={CryptoPlans} />
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
