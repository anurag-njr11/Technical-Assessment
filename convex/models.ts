import { internalAction } from "./_generated/server"
import { assistantModel, callModel, getPanel, preset } from "./judges"
import { modelLabel } from "./providers"
import type { ModelRef } from "./providers"

// `npx convex run models:check`: pings every model the deployment will use
// (6 judges + the assistant) with a tiny prompt, so a wrong id, missing key or
// exhausted free tier shows up before a candidate submits.

export const check = internalAction({
  args: {},
  handler: async () => {
    const panel = getPanel()
    const refs: Array<{ role: string; ref: ModelRef }> = [
      ...panel.flatMap((j) => [
        { role: `${j.name} primary`, ref: j.primary },
        { role: `${j.name} fallback`, ref: j.fallback },
      ]),
      { role: "assistant", ref: assistantModel() },
    ]
    const results = await Promise.all(
      refs.map(async ({ role, ref }) => {
        const started = Date.now()
        try {
          const text = await callModel(ref, 'Reply with the JSON {"ok": true} and nothing else.', "You are a health check.")
          return { role, model: modelLabel(ref), ok: /ok/i.test(text), ms: Date.now() - started, detail: text.slice(0, 80) }
        } catch (err) {
          return { role, model: modelLabel(ref), ok: false, ms: Date.now() - started, detail: err instanceof Error ? err.message : String(err) }
        }
      }),
    )
    return { preset: preset(), results }
  },
})
