// REL-7 regression gate against a staging deployment with real models.
// Needs CONVEX_DEPLOY_KEY for the staging deployment (the code is deployed first by CI).
// Exits 1 when the gate fails, the run errors, or it does not finish in time.
import { execFileSync } from "node:child_process"

const run = (fn, args = {}) =>
  JSON.parse(execFileSync("npx", ["convex", "run", fn, JSON.stringify(args)], { encoding: "utf8", shell: process.platform === "win32" }).trim() || "null")

const runId = run("reliability:ciStartGolden")
if (!runId) {
  console.log("No golden-set labels on this deployment yet: nothing to gate.")
  process.exit(0)
}
console.log(`Golden-set run ${runId} started.`)
const deadline = Date.now() + 40 * 60 * 1000
for (;;) {
  const s = run("reliability:ciGateStatus", { runId })
  if (s.status === "error") {
    console.error(`Run failed: ${s.error}`)
    process.exit(1)
  }
  if (s.status === "done") {
    if (!s.gate) {
      console.log("Run finished, but there is no baseline to compare with. Set one on /reliability.")
      process.exit(0)
    }
    console.log(`Kappa ${s.gate.baselineKappa.toFixed(3)} (baseline) -> ${s.gate.candidateKappa.toFixed(3)}`)
    if (!s.gate.pass) {
      console.error(`Regression gate FAILED:\n- ${s.gate.failures.join("\n- ")}`)
      process.exit(1)
    }
    console.log("Regression gate passed.")
    process.exit(0)
  }
  if (Date.now() > deadline) {
    console.error("Timed out waiting for the golden-set run.")
    process.exit(1)
  }
  console.log(`  ${s.done}/${s.total} graded…`)
  await new Promise((r) => setTimeout(r, 20_000))
}
