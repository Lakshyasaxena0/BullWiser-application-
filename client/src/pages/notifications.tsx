import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, CheckCircle2, AlertTriangle, Info, Trash2, CheckCheck } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";

type N = { id: number; type: string; title: string; message: string; symbol: string | null; read: boolean; createdAt: string };

const ICON: Record<string, JSX.Element> = {
  success: <CheckCircle2 className="h-5 w-5 text-green-600" />,
  warning: <AlertTriangle className="h-5 w-5 text-amber-600" />,
  info: <Info className="h-5 w-5 text-blue-600" />,
};

export default function Notifications() {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { data = [], isLoading } = useQuery<N[]>({ queryKey: ["/api/notifications"], staleTime: 0, refetchInterval: 60000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/notifications"] });
  const markAll = useMutation({ mutationFn: () => apiRequest("POST", "/api/notifications/read-all"), onSuccess: refresh });
  const markOne = useMutation({ mutationFn: (id: number) => apiRequest("POST", `/api/notifications/${id}/read`), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: number) => apiRequest("DELETE", `/api/notifications/${id}`), onSuccess: refresh });
  const unread = data.filter((n) => !n.read).length;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4" data-testid="page-notifications">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500">{unread ? `${unread} unread` : "You're all caught up"} · results of your predictions appear here once their date has passed and the real price is known.</p>
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAll.mutate()} data-testid="button-mark-all-read">
            <CheckCheck className="h-4 w-4 mr-1" /> Mark all read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="h-32 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : data.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-gray-500">
          <Bell className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          No notifications yet. When a prediction you made reaches its target date, we check it against the real price and tell you here whether it was right.
        </CardContent></Card>
      ) : data.map((n) => (
        <Card key={n.id} className={n.read ? "" : "border-primary/40 bg-primary/5"} data-testid={`notification-${n.id}`}>
          <CardContent className="p-4 flex items-start gap-3">
            <div className="mt-0.5">{ICON[n.type] ?? ICON.info}</div>
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { if (!n.read) markOne.mutate(n.id); if (n.symbol) setLocation("/prediction-analytics"); }}>
              <p className="font-semibold text-gray-900 text-sm">{n.title}</p>
              <p className="text-sm text-gray-600">{n.message}</p>
              <p className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString("en-IN")}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => remove.mutate(n.id)} aria-label="Delete notification"><Trash2 className="h-4 w-4 text-gray-400" /></Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
