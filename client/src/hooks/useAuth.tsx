import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { getQueryFn } from "@/lib/queryClient";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    // on401: "returnNull" — unauthenticated is not an error, just means logged out.
    // The fixed getQueryFn also returns null for network errors and non-2xx
    // responses, so the app never gets stuck in an infinite loading state when
    // the backend is unreachable (e.g. on Netlify static hosting without a
    // backend, or when the Replit server is sleeping).
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    staleTime: 5 * 60 * 1000, // 5 minutes

    // Safety net: if the query somehow stays pending for more than 8 seconds,
    // treat it as "not authenticated" instead of showing the spinner forever.
    // gcTime controls how long unused cache data is kept.
    gcTime: 10 * 60 * 1000,
  });

  return {
    user: user ? { ...user, role: user.role || "user" } : null,
    isLoading,
    isAuthenticated: !!user,
    error,
  };
}
