// ─────────────────────────────────────────────────────────────────────────────
// groqClient.ts
// The ONLY external AI provider: Groq (llama-3.3-70b-versatile).
// Plain fetch — no OpenAI SDK/key involved. Returns null when Groq is not
// usable (no key, bad key, rate limit, timeout, garbage output) so callers can
// fall back to the built-in statistics + astrology engine.
// ─────────────────────────────────────────────────────────────────────────────

const GROQ_DEFAULT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
// The frontend reaches the API through a Netlify proxy that gives up after ~26 s, and one
// prediction makes up to two Groq calls. Keep each call short and stop calling a provider
// that is down (circuit breaker) so a Groq outage costs at most one slow request, not every one.
const TIMEOUT_MS = 8_000;
let breakerOpenUntil = 0;
const openBreaker = (ms: number, why: string) => {
  breakerOpenUntil = Date.now() + ms;
  console.error(`[AI] Groq paused for ${Math.round(ms / 1000)}s (${why}) — built-in engine in use`);
};

/** Accepts the existing Render var name (Groq_API_key) or the conventional GROQ_API_KEY. */
export function getGroqKey(): string {
  return (process.env.Groq_API_key || process.env.GROQ_API_KEY || '').trim();
}

export function isGroqConfigured(): boolean {
  return getGroqKey().length > 0;
}

export async function groqJSON(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 900
): Promise<any | null> {
  const key = getGroqKey();
  if (!key) return null;
  if (Date.now() < breakerOpenUntil) return null;   // recently failed: don't make users wait again

  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(process.env.GROQ_API_URL || GROQ_DEFAULT_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: systemPrompt + '\n\nIMPORTANT: Return valid JSON only. No markdown, no code fences.' },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
          max_tokens: maxTokens,
        }),
      });

      if (res.ok) {
        const data: any = await res.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text) return JSON.parse(text);
        return null;
      }
      // Bad key / forbidden: retrying is pointless, and so is calling again for a while
      if (res.status === 401 || res.status === 403) {
        openBreaker(10 * 60_000, `key rejected, HTTP ${res.status}`);
        return null;
      }
      // Rate limited: back off for the period Groq asks for (default 30 s, max 2 min), no retry
      if (res.status === 429) {
        const wait = Number(res.headers.get('retry-after'));
        openBreaker(Math.min(120_000, Math.max(10_000, (isFinite(wait) && wait > 0 ? wait : 30) * 1000)), 'rate limited');
        return null;
      }
      console.error(`[AI] Groq error ${res.status} (attempt ${attempt})`);
      if (res.status < 500) return null;
      if (attempt === 2) openBreaker(60_000, `server error ${res.status}`);
    } catch (err: any) {
      const timedOut = err?.name === 'AbortError';
      console.error(`[AI] Groq call failed:`, timedOut ? 'timeout' : err?.message || err);
      // A timeout or network failure means Groq is slow/down: stop here, no second long wait
      openBreaker(60_000, timedOut ? 'timeout' : 'network error');
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
