// Model transport. Every model is reached through an OpenAI-compatible
// /chat/completions endpoint; the provider decides the base URL and key:
//
//   openrouter  https://openrouter.ai/api/v1              OPENROUTER_API_KEY (or LLM_API_KEY)
//   gemini      Google AI Studio's OpenAI-compatible API   GEMINI_API_KEY
//   groq        https://api.groq.com/openai/v1             GROQ_API_KEY
//   ollama      OLLAMA_BASE_URL (http://127.0.0.1:11434/v1), no key; local deployments only
//
// A model without a provider uses LLM_BASE_URL / LLM_API_KEY (the original setup).
// Free tiers are rate-limited, so calls are capped per provider and 429s back off.

export type Provider = "openrouter" | "gemini" | "groq" | "ollama"
export const PROVIDERS: Provider[] = ["openrouter", "gemini", "groq", "ollama"]
export type ModelRef = { model: string; family: string; provider?: Provider }

const OPENROUTER = "https://openrouter.ai/api/v1"
const KEY_VAR: Record<Exclude<Provider, "ollama">, string> = { openrouter: "OPENROUTER_API_KEY", gemini: "GEMINI_API_KEY", groq: "GROQ_API_KEY" }

function endpoint(ref: ModelRef): { baseUrl: string; key?: string } {
  switch (ref.provider) {
    case "openrouter":
      return { baseUrl: OPENROUTER, key: process.env.OPENROUTER_API_KEY ?? process.env.LLM_API_KEY }
    case "gemini":
      return { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", key: process.env.GEMINI_API_KEY }
    case "groq":
      return { baseUrl: "https://api.groq.com/openai/v1", key: process.env.GROQ_API_KEY }
    case "ollama":
      return { baseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1" }
    default:
      return { baseUrl: process.env.LLM_BASE_URL ?? OPENROUTER, key: process.env.LLM_API_KEY }
  }
}

/** True when at least one model endpoint is configured. */
export function aiConfigured(): boolean {
  const e = process.env
  return !!(e.LLM_API_KEY || e.LLM_BASE_URL || e.OPENROUTER_API_KEY || e.GEMINI_API_KEY || e.GROQ_API_KEY || e.OLLAMA_BASE_URL || e.JUDGE_PRESET === "local")
}

/** "groq:openai/gpt-oss-120b" → provider groq; a plain id uses the default endpoint. */
export function parseModel(spec: string, family = "assistant"): ModelRef {
  const i = spec.indexOf(":")
  const head = i > 0 ? spec.slice(0, i) : ""
  return (PROVIDERS as string[]).includes(head)
    ? { provider: head as Provider, model: spec.slice(i + 1), family }
    : { model: spec, family }
}

export const modelLabel = (ref: ModelRef) => (ref.provider ? `${ref.provider}:${ref.model}` : ref.model)

// ---------------------------------------------------------------------------
// Per-provider concurrency (per action instance) and 429 backoff
// ---------------------------------------------------------------------------

// ponytail: per-isolate limiter; a shared token bucket in the DB if many gradings run at once.
const LIMIT: Record<string, number> = { gemini: 3, groq: 4, openrouter: 6, ollama: 1, default: 8 }
const active: Record<string, number> = {}
const waiting: Record<string, Array<() => void>> = {}

async function acquire(key: string) {
  if ((active[key] ?? 0) < (LIMIT[key] ?? 8)) {
    active[key] = (active[key] ?? 0) + 1
    return
  }
  await new Promise<void>((resolve) => (waiting[key] ??= []).push(resolve))
}

function release(key: string) {
  const next = waiting[key]?.shift()
  if (next) next() // hand the slot over
  else active[key] = Math.max(0, (active[key] ?? 1) - 1)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const MAX_429_RETRIES = 3

/** POSTs to the model's endpoint; waits for a slot and retries 429/503 (Retry-After or exponential). */
export async function post(ref: ModelRef, body: Record<string, unknown>): Promise<Response> {
  const { baseUrl, key } = endpoint(ref)
  const keyVar = ref.provider && ref.provider !== "ollama" ? KEY_VAR[ref.provider] : null
  if (keyVar && !key) throw new Error(`${keyVar} is not set.`)
  const slot = ref.provider ?? "default"
  await acquire(slot)
  try {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({ ...body, model: ref.model }),
      })
      // 429 rate limited, 503 overloaded ("high demand"): both clear up after a short wait.
      if ((response.status !== 429 && response.status !== 503) || attempt >= MAX_429_RETRIES) return response
      const retryAfter = Number(response.headers.get("retry-after"))
      await sleep(Math.min(20_000, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** (attempt + 1)))
    }
  } finally {
    release(slot)
  }
}
