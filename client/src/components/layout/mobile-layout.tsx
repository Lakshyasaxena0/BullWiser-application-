// Navigation for phones (portrait AND landscape): top bar, slide-in menu with every page + sign out, bottom tab bar.
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Bell, Menu, X, LogOut, Home, TrendingUp, LineChart, MoreHorizontal } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { BullWiserLogo } from "@/components/BullWiserLogo";
import { navigation } from "@/components/layout/sidebar";
import VerifyEmailBanner from "@/components/VerifyEmailBanner";

const TABS = [
  { name: "Home", href: "/", icon: Home },
  { name: "Predict", href: "/predictions", icon: TrendingUp },
  { name: "Outlook", href: "/market-outlook", icon: LineChart },
  { name: "Alerts", href: "/notifications", icon: Bell },
];

export default function MobileLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { data: credits } = useQuery<{ balance: number }>({ queryKey: ["/api/credits/me"], refetchInterval: 60000 });
  const { data: notifs } = useQuery<any[]>({ queryKey: ["/api/notifications"], staleTime: 0, refetchInterval: 60000 });
  const unread = notifs?.filter((n) => !n.read).length ?? 0;
  const greet = user?.firstName || (user?.email ? user.email.split("@")[0] : "there");
  const signOut = async () => { try { await fetch("/api/logout", { method: "POST", credentials: "include" }); } catch {} window.location.href = "/"; };
  const active = (href: string) => (href === "/" ? location === "/" || location === "/dashboard" : location === href);

  return (
    <div className="min-h-[100dvh] bg-gray-50 flex flex-col">
      <header className="fixed top-0 inset-x-0 z-40 bg-white border-b border-gray-200" style={{ paddingTop: "env(safe-area-inset-top)", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}>
        <div className="flex items-center justify-between px-3 h-14">
          <button className="p-2 rounded-md hover:bg-gray-100" onClick={() => setOpen(true)} aria-label="Open menu" data-testid="mobile-menu-button"><Menu className="h-5 w-5" /></button>
          <Link href="/"><a className="flex items-center gap-2"><BullWiserLogo className="w-8 h-8" /><span className="font-bold text-lg">BullWiser</span></a></Link>
          <Link href="/plans"><a className="text-sm font-semibold text-primary px-2" data-testid="mobile-credits">🪙 {credits?.balance ?? "…"}</a></Link>
        </div>
      </header>

      {open && <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-white shadow-xl transition-transform duration-200 flex flex-col ${open ? "translate-x-0" : "-translate-x-full"}`} style={{ paddingTop: "env(safe-area-inset-top)" }} aria-hidden={!open}>
        <div className="flex items-center justify-between p-4 border-b">
          <div><p className="font-semibold">Hi, {greet}</p><Link href="/plans"><a onClick={() => setOpen(false)} className="text-sm text-primary">🪙 {credits?.balance ?? "…"} credits</a></Link></div>
          <button className="p-2" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.name} href={item.href}>
                <a onClick={() => setOpen(false)} className={`flex items-center gap-3 p-3 rounded-lg ${active(item.href) ? "bg-primary/15 text-primary font-semibold" : "text-gray-700 hover:bg-gray-100"}`} data-testid={`mobile-nav-${item.name.toLowerCase().replace(/ /g, "-")}`}>
                  <Icon className="h-5 w-5" /><span>{item.name}</span>
                </a>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <button onClick={signOut} className="w-full flex items-center gap-3 p-3 rounded-lg text-gray-700 hover:bg-gray-100" data-testid="mobile-sign-out"><LogOut className="h-5 w-5" /><span>Sign Out</span></button>
        </div>
      </aside>

      <main className="flex-1 w-full max-w-3xl mx-auto px-3 pt-[4.5rem] pb-24 space-y-4 overflow-x-hidden" style={{ paddingLeft: "max(0.75rem, env(safe-area-inset-left))", paddingRight: "max(0.75rem, env(safe-area-inset-right))" }}>
        <VerifyEmailBanner />
        {children}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex justify-around items-stretch h-14 max-w-3xl mx-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.name} onClick={() => setLocation(t.href)} className={`relative flex-1 flex flex-col items-center justify-center px-2 ${active(t.href) ? "text-primary" : "text-gray-500"}`} data-testid={`tab-${t.name.toLowerCase()}`}>
                <Icon className="h-5 w-5" /><span className="text-[11px] mt-0.5">{t.name}</span>
                {t.name === "Alerts" && unread > 0 && <span className="absolute top-1.5 right-3 bg-red-500 text-white text-[10px] rounded-full h-4 min-w-4 px-1 flex items-center justify-center">{unread > 9 ? "9+" : unread}</span>}
              </button>
            );
          })}
          <button className="flex flex-col items-center justify-center flex-1 px-2 text-gray-500" onClick={() => setOpen(true)} data-testid="tab-more"><MoreHorizontal className="h-5 w-5" /><span className="text-[11px] mt-0.5">More</span></button>
        </div>
      </nav>
    </div>
  );
}
