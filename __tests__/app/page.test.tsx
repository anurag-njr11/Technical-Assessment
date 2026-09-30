import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { SCENARIO } from "@/lib/scenario"
import { ANSWER_KEYS } from "@/convex/answerKey"

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

const srcFiles = walk(path.resolve(__dirname, "../../src")).filter((f) => /\.(ts|tsx|json)$/.test(f))

describe("answer key never ships to the browser", () => {
  it("no file under src/ imports the server-only answer key", () => {
    const offenders = srcFiles.filter((f) => /(from|import\()\s*["'][^"']*answerKey["']/.test(readFileSync(f, "utf8")))
    expect(offenders).toEqual([])
  })

  it("no answer-key description text appears in candidate-visible code", () => {
    const all = srcFiles.map((f) => readFileSync(f, "utf8")).join("\n")
    for (const item of ANSWER_KEYS[SCENARIO.id].items) {
      expect(all).not.toContain(item.description)
      expect(all).not.toContain(item.acceptableFix)
    }
  })
})

describe("scenario content matches its answer key", () => {
  const key = ANSWER_KEYS[SCENARIO.id]

  it("has an answer key for the candidate scenario", () => {
    expect(key).toBeDefined()
  })

  it("every planted issue and decoy points at lines the candidate can actually see", () => {
    for (const item of key.items) {
      const file = SCENARIO.files.find((f) => f.path === item.file)
      expect(file, `${item.id} file ${item.file}`).toBeDefined()
      const visible = new Set(file!.lines.map((l) => l.n))
      for (let n = item.lineStart; n <= item.lineEnd; n++) {
        expect(visible.has(n), `${item.id} line ${n}`).toBe(true)
      }
    }
  })

  it("the hallucinated helper is verifiably absent from the provided utils file", () => {
    const utils = SCENARIO.files.find((f) => f.path === "utils/dates.py")!
    const code = utils.lines.map((l) => l.code).join("\n")
    expect(code).toContain("def parse_iso_date")
    expect(code).not.toContain("parse_date_safe")
  })

  it("the decoy behaviour is required by the ticket, so flagging it is fair to penalise", () => {
    expect(SCENARIO.criteria.join(" ")).toMatch(/capped at 100/)
  })
})
