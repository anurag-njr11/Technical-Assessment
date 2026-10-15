import { afterEach, describe, expect, it, vi } from "vitest"
import { parseModel, post } from "../../convex/providers"
import { FREE_PANEL, LOCAL_PANEL, assistantModel, callModel, getPanel, preset, stripThinking, validatePanel } from "../../convex/judges"

const ENV = ["GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "LLM_API_KEY", "LLM_BASE_URL", "JUDGE_PRESET", "ASSISTANT_MODEL", "OLLAMA_BASE_URL"]
afterEach(() => {
  for (const k of ENV) delete process.env[k]
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const ok = (content = "{}") => Response.json({ choices: [{ message: { content } }] })

describe("model providers", () => {
  it("parses provider-prefixed ids and leaves plain ids on the default endpoint", () => {
    expect(parseModel("groq:openai/gpt-oss-120b")).toEqual({ provider: "groq", model: "openai/gpt-oss-120b", family: "assistant" })
    expect(parseModel("ollama:qwen3:4b")).toEqual({ provider: "ollama", model: "qwen3:4b", family: "assistant" })
    expect(parseModel("anthropic/claude-sonnet-5")).toEqual({ model: "anthropic/claude-sonnet-5", family: "assistant" })
  })

  it("routes each provider to its own base URL and key", async () => {
    process.env.GEMINI_API_KEY = "g"
    process.env.GROQ_API_KEY = "q"
    process.env.LLM_API_KEY = "or"
    const calls: Array<{ url: string; auth?: string; model: string }> = []
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: { headers: Record<string, string>; body: string }) => {
      calls.push({ url, auth: init.headers.Authorization, model: JSON.parse(init.body).model })
      return ok()
    }))
    await callModel({ provider: "gemini", model: "gemini-flash-latest", family: "google" }, "hi")
    await callModel({ provider: "groq", model: "qwen/qwen3-32b", family: "alibaba" }, "hi")
    await callModel({ provider: "openrouter", model: "x:free", family: "x" }, "hi")
    await callModel({ provider: "ollama", model: "qwen3:4b", family: "alibaba" }, "hi")
    expect(calls).toEqual([
      { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", auth: "Bearer g", model: "gemini-flash-latest" },
      { url: "https://api.groq.com/openai/v1/chat/completions", auth: "Bearer q", model: "qwen/qwen3-32b" },
      { url: "https://openrouter.ai/api/v1/chat/completions", auth: "Bearer or", model: "x:free" },
      { url: "http://127.0.0.1:11434/v1/chat/completions", auth: undefined, model: "qwen3:4b" },
    ])
  })

  it("backs off on 429 (Retry-After) and then succeeds", async () => {
    vi.useFakeTimers()
    let n = 0
    vi.stubGlobal("fetch", vi.fn(async () => (++n < 3 ? new Response("slow down", { status: 429, headers: { "retry-after": "1" } }) : ok("done"))))
    const pending = post({ provider: "groq", model: "m", family: "f" }, {})
    await vi.advanceTimersByTimeAsync(2500)
    expect((await pending).status).toBe(200)
    expect(n).toBe(3)
  })

  it("caps concurrent calls per provider", async () => {
    let inFlight = 0
    let peak = 0
    vi.stubGlobal("fetch", vi.fn(async () => {
      peak = Math.max(peak, ++inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return ok()
    }))
    await Promise.all(Array.from({ length: 10 }, () => post({ provider: "gemini", model: "m", family: "f" }, {})))
    expect(peak).toBe(3)
  })

  it("picks the preset from the keys present, and the panels keep six families", () => {
    expect(preset()).toBe("openrouter")
    process.env.GROQ_API_KEY = "q"
    expect(preset()).toBe("free")
    expect(getPanel()).toBe(FREE_PANEL)
    expect(assistantModel()).toEqual(FREE_PANEL[0].primary)
    process.env.JUDGE_PRESET = "local"
    expect(getPanel()).toBe(LOCAL_PANEL)
    expect(() => validatePanel(FREE_PANEL)).not.toThrow()
    expect(() => validatePanel(LOCAL_PANEL)).not.toThrow()
    expect(() => validatePanel([{ ...FREE_PANEL[0], primary: { ...FREE_PANEL[0].primary, provider: "nope" as never } }, FREE_PANEL[1], FREE_PANEL[2]])).toThrow(/Unknown provider/)
  })

  it("strips reasoning blocks from replies", () => {
    expect(stripThinking("<think>hmm, maybe</think>\n{\"decision\": true}")).toBe('{"decision": true}')
    expect(stripThinking("<think>still thinking")).toBe("")
  })
})
