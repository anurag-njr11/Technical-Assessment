"use node"

import { v } from "convex/values"
import { internalAction } from "./_generated/server"
import { newQuickJSWASMModuleFromVariant } from "quickjs-emscripten-core"
import type { QuickJSWASMModule } from "quickjs-emscripten-core"
import variant from "@jitl/quickjs-singlefile-cjs-release-sync"
import { HIDDEN_TESTS, PRELUDE } from "./hiddenTests"
import type { HiddenTest } from "./hiddenTests"

// Runs a candidate's code and the hidden tests in QuickJS compiled to
// WebAssembly. The guest gets no host objects at all (no process, fs, network
// or env vars), only what PRELUDE defines, with a memory cap and a wall-clock
// budget enforced by an interrupt handler, so untrusted code can't read the
// deployment's secrets or hang grading.

export type TestOutcome = { name: string; pass: boolean; fault?: string; detail?: string }

const MEMORY_BYTES = 32 * 1024 * 1024
const BUDGET_MS = 3000

let modulePromise: Promise<QuickJSWASMModule> | null = null
const quickjs = () => (modulePromise ??= newQuickJSWASMModuleFromVariant(variant))

/** Top-level names the tests may call (functions, consts, classes), as the visible test runner does. */
function topLevelNames(code: string): string[] {
  const re = /^(?:export\s+)?(?:async\s+)?(?:function\*?\s+|const\s+|let\s+|var\s+|class\s+)([A-Za-z_$][\w$]*)/gm
  return [...new Set([...code.matchAll(re)].map((m) => m[1]))]
}

export async function runHiddenTests(code: string, tests: HiddenTest[]): Promise<TestOutcome[]> {
  const QuickJS = await quickjs()
  const runtime = QuickJS.newRuntime()
  runtime.setMemoryLimit(MEMORY_BYTES)
  runtime.setMaxStackSize(512 * 1024)
  const deadline = Date.now() + BUDGET_MS
  runtime.setInterruptHandler(() => Date.now() > deadline)
  const vm = runtime.newContext()
  const fail = (detail: string) => tests.map((t) => ({ name: t.name, pass: false, ...(t.fault ? { fault: t.fault } : {}), detail }))
  try {
    const names = topLevelNames(code)
    // Candidate code runs in its own function scope; tests see only its top-level names.
    const harness = `${PRELUDE}
globalThis.__out = null
const __ns = (() => {
${code.replace(/\bexport\s+(default\s+)?/g, "")}
;return { ${names.join(", ")} }
})()
const __tests = ${JSON.stringify(tests.map((t) => ({ name: t.name, src: t.src })))}
const __AsyncFunction = (async () => {}).constructor
;(async () => {
  const out = []
  for (const t of __tests) {
    try {
      const pass = (await new __AsyncFunction(...Object.keys(__ns), "strict", "cart", "fakeDb", t.src)(...Object.values(__ns), strict, cart, fakeDb)) === true
      out.push({ pass })
    } catch (e) {
      out.push({ pass: false, detail: String((e && e.message) || e).slice(0, 200) })
    }
  }
  globalThis.__out = JSON.stringify(out)
})()`
    const evaluated = vm.evalCode(harness, "candidate.js")
    if (evaluated.error) {
      const err = vm.dump(evaluated.error)
      evaluated.error.dispose()
      return fail(`Code does not run: ${String(err?.message ?? err).slice(0, 200)}`)
    }
    evaluated.value.dispose()
    // Drive the async tests until they finish or the budget runs out.
    for (;;) {
      const jobs = runtime.executePendingJobs()
      if (jobs.error) {
        jobs.error.dispose()
        return fail("Stopped: the code ran too long or used too much memory.")
      }
      const out = vm.getProp(vm.global, "__out")
      const value = vm.dump(out)
      out.dispose()
      if (typeof value === "string") {
        const results = JSON.parse(value) as Array<{ pass: boolean; detail?: string }>
        return tests.map((t, i) => ({ name: t.name, pass: !!results[i]?.pass, ...(t.fault ? { fault: t.fault } : {}), ...(results[i]?.detail ? { detail: results[i].detail } : {}) }))
      }
      if (jobs.value === 0 || Date.now() > deadline) return fail("Stopped: the tests did not finish in time.")
    }
  } catch (err) {
    return fail(`Sandbox error: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    vm.dispose()
    runtime.dispose()
  }
}

export const run = internalAction({
  args: { scenarioId: v.string(), code: v.string() },
  handler: async (_ctx, args): Promise<TestOutcome[]> => {
    const tests = HIDDEN_TESTS[args.scenarioId]
    return tests ? await runHiddenTests(args.code, tests) : []
  },
})
