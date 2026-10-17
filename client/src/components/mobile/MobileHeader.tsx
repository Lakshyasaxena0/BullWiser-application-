import { Bell, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface MobileHeaderProps {
  onMenuClick: () => void;
  notificationCount?: number;
}

export default function MobileHeader({ onMenuClick, notificationCount = 0 }: MobileHeaderProps) {
  return (
    <header className="md:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-40 safe-area-top">
      <div className="flex items-center justify-between px-4 h-14">
        <Button
          variant="ghost"
          size="sm"
          onClick={onMenuClick}
          className="p-2"
          data-testid="mobile-menu-button"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">B</span>
            </div>
            <span className="font-bold text-lg">BullWiser</span>
          </div>
          <span className="text-xs text-gray-500 ml-10">Powered by Faraksh</span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="relative p-2"
          data-testid="mobile-notifications"
        >
          <Bell className="h-5 w-5" />
          {notificationCount > 0 && (
            <Badge className="absolute -top-1 -right-1 bg-red-500 text-white text-xs h-4 w-4 flex items-center justify-center p-0 rounded-full">
              {notificationCount}
            </Badge>
          )}
        </Button>
      </div>
    </header>
  );
}