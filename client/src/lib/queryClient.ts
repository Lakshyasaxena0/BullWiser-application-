import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    // Prefer the server's own readable message (e.g. {"message":"Active crypto subscription required"})
    let readable = '';
    try { const j = JSON.parse(text); if (j && typeof j.message === 'string') readable = j.message; } catch { /* not JSON */ }
    throw new Error(readable || `${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });
  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn =
  <T>({ on401: unauthorizedBehavior }: { on401: UnauthorizedBehavior }): QueryFunction<T> =>
  async ({ queryKey }) => {
    const url = queryKey[0] as string;
    let res: Response;
    try {
      res = await fetch(url, { credentials: "include" });
    } catch {
      if (unauthorizedBehavior === "returnNull") return null as T;
      throw new Error(`Network error reaching ${url}`);
    }
    if (unauthorizedBehavior === "returnNull" && res.status === 401) return null as T;
    if (!res.ok && unauthorizedBehavior === "returnNull") return null as T;
    await throwIfResNotOk(res);
    return await res.json() as T;
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: { retry: false },
  },
});
