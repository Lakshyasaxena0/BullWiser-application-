import { Home, TrendingUp, Briefcase, Clock, User, Bitcoin } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button"; // Assuming Button component is in this path

const navigation = [
  { name: 'Home', href: '/dashboard', icon: Home },
  { name: 'Predictions', href: '/predictions', icon: TrendingUp },
  { name: 'Portfolio', href: '/portfolio', icon: Briefcase },
  { name: 'History', href: '/history', icon: Clock },
  { name: 'Profile', href: '/profile', icon: User },
];

export default function MobileBottomNav() {
  const [location, setLocation] = useLocation();

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-bottom">
      <nav className="flex justify-around items-center h-16">
        {navigation.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;

          return (
            <Link key={item.name} href={item.href}>
              <a
                className={cn(
                  "flex flex-col items-center justify-center w-full h-full px-2 py-1 transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-gray-500 hover:text-gray-700"
                )}
                data-testid={`mobile-nav-${item.name.toLowerCase()}`}
              >
                <Icon className={cn("h-5 w-5", isActive && "mb-0.5")} />
                <span className="text-xs mt-1">{item.name}</span>
              </a>
            </Link>
          );
        })}

        <Button
          variant={location === '/cryptocurrencies' ? 'default' : 'ghost'}
          size="sm"
          className="flex flex-col items-center p-2 h-auto min-h-[60px]"
          onClick={() => setLocation('/cryptocurrencies')}
          data-testid="mobile-nav-crypto"
        >
          <Bitcoin className="h-5 w-5 mb-1" />
          <span className="text-xs">Crypto</span>
        </Button>
      </nav>
    </div>
  );
}
