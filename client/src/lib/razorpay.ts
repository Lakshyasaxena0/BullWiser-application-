import { apiRequest } from "@/lib/queryClient";

declare global {
  interface Window { Razorpay?: any }
}

let scriptPromise: Promise<boolean> | null = null;
function loadCheckoutScript(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => resolve(true);
      s.onerror = () => { scriptPromise = null; resolve(false); };
      document.body.appendChild(s);
    });
  }
  return scriptPromise;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try { const j = await res.json(); return j?.message || fallback; } catch { return fallback; }
}

export interface PayOptions {
  kind: "stock" | "crypto";
  plan: Record<string, any>;           // mode, tradeType, tradesPerDay, duration (+ cryptoValue for crypto). Price is computed on the server.
  prefill?: { name?: string; email?: string };
}
export type PayResult =
  | { status: "success"; subscriptionId: number }
  | { status: "cancelled" };

/**
 * Opens Razorpay Checkout. Resolves with "success" ONLY after the server has verified the payment and
 * activated the subscription. Rejects with an Error (message is safe to show) on any failure.
 */
export async function payForPlan({ kind, plan, prefill }: PayOptions): Promise<PayResult> {
  let orderRes: Response;
  try {
    orderRes = await apiRequest("POST", "/api/payments/create-order", { ...plan, kind });
  } catch (e: any) {
    const raw = String(e?.message || "").replace(/^\d+:\s*/, "");
    let msg = raw;
    try { msg = JSON.parse(raw)?.message || raw; } catch { /* plain text */ }
    throw new Error(msg || "Could not start the payment");
  }
  const order = await orderRes.json();

  if (!(await loadCheckoutScript()) || !window.Razorpay) {
    throw new Error("Could not load the payment window. Check your internet connection and try again.");
  }

  return new Promise<PayResult>((resolve, reject) => {
    let settled = false;
    const rzp = new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: order.name || "BullWiser",
      description: order.description,
      prefill,
      theme: { color: "#2563eb" },
      modal: { ondismiss: () => { if (!settled) { settled = true; resolve({ status: "cancelled" }); } } },
      handler: async (response: any) => {
        settled = true;
        try {
          const res = await fetch("/api/payments/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          });
          if (!res.ok) return reject(new Error(await readError(res, "Payment could not be confirmed")));
          const data = await res.json();
          resolve({ status: "success", subscriptionId: data.subscriptionId });
        } catch {
          reject(new Error("Could not confirm the payment. If money was deducted, your plan will activate automatically within a few minutes."));
        }
      },
    });
    rzp.on("payment.failed", (resp: any) => {
      if (settled) return;
      settled = true;
      reject(new Error(resp?.error?.description || "Payment failed. No money was taken, or it will be refunded."));
    });
    rzp.open();
  });
}
