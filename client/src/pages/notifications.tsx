import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Bell, User, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const STORAGE_KEY = "bullwiser_notifications";

function getUnreadCount(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return 0;
    const notifs = JSON.parse(stored);
    return notifs.filter((n: any) => !n.read).length;
  } catch { return 0; }
}

export default function Header() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);

  // Read real unread count from localStorage on mount and every 10 seconds
  useEffect(() => {
    setUnreadCount(getUnreadCount());
    const interval = setInterval(() => setUnreadCount(getUnreadCount()), 10000);
    // Also update when storage changes (e.g. from notifications page)
    const onStorage = () => setUnreadCount(getUnreadCount());
    window.addEventListener('storage', onStorage);
    return () => { clearInterval(interval); window.removeEventListener('storage', onStorage); };
  }, []);

  const getPageName = (path: string) => {
    const pages: Record<string, string> = {
      "/": "Dashboard", "/predictions": "Predictions", "/portfolio": "Portfolio",
      "/subscription": "Subscription", "/notifications": "Notifications",
      "/plans": "Plans", "/settings": "Settings", "/activities": "Activities",
      "/trading-history": "Trading History", "/cryptocurrencies": "Cryptocurrencies",
      "/crypto-plans": "Crypto Plans", "/crypto-predictions": "Crypto Predictions",
      "/crypto-trading": "Crypto Trading",
    };
    return pages[path] || "Dashboard";
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="flex items-center justify-between p-4">
        <div className="flex-1 flex items-center">
          <div className="text-lg font-semibold text-gray-800">{getPageName(location)}</div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Bell with real unread count */}
          <Button
            variant="ghost"
            size="sm"
            className="relative"
            onClick={() => setLocation('/notifications')}
            data-testid="button-notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <Badge
                className="absolute -top-1 -right-1 bg-red-500 text-white text-xs h-5 w-5 flex items-center justify-center p-0 rounded-full"
                data-testid="badge-notification-count"
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </Badge>
            )}
          </Button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full" data-testid="button-user-menu">
                <Avatar>
                  <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.email || "User"} />
                  <AvatarFallback><User className="h-5 w-5" /></AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-white border-gray-200" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : "User"}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">{user?.email || "No email"}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setLocation('/portfolio')}>
                <User className="mr-2 h-4 w-4" /><span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLocation('/subscription')}>
                <span className="mr-2">💎</span><span>Subscription</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/'; }}
                className="text-red-600"
                data-testid="button-logout"
              >
                <LogOut className="mr-2 h-4 w-4" /><span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
