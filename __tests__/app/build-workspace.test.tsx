import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { DISC_12 } from "@/lib/scenario"
import { interviewQuestions } from "@/lib/interview"

vi.mock("convex/react", () => ({ useMutation: () => vi.fn(async () => undefined) }))

describe("Directed Build workspace", () => {
  it("renders the ticket, editor, restored chat and lets the candidate insert a suggestion", async () => {
    const { BuildWorkspace } = await import("@/components/build-workspace")
    const setCode = vi.fn()
    render(
      <BuildWorkspace
        token="t"
        scenario={DISC_12}
        code={DISC_12.starterCode}
        setCode={setCode}
        chat={[
          { id: "e0", type: "ai_prompt", data: "write the code table" },
          { id: "e1", type: "ai_response", data: JSON.stringify({ text: "Here you go", code: "const CODES = {}" }) },
        ]}
        onSubmit={() => {}}
        submitting={false}
        error=""
      />,
    )
    expect(screen.getByLabelText("Code editor")).toBeInTheDocument()
    expect(screen.getByText("write the code table")).toBeInTheDocument()
    fireEvent.click(screen.getByText("Insert into editor"))
    expect(setCode).toHaveBeenCalledWith(expect.stringContaining("const CODES = {}"))
    expect(screen.getByText("Inserted into the editor")).toBeInTheDocument()
  })
})

describe("interview guide", () => {
  it("asks one structured question per missed category plus follow-ups on weak spots", () => {
    const qs = interviewQuestions(
      [
        { id: "I1", kind: "issue", title: "SQL injection", category: "Security", outcome: "missed", explanation: null },
        { id: "I2", kind: "issue", title: "Other security", category: "Security", outcome: "missed", explanation: null },
        { id: "I3", kind: "issue", title: "Off by one", category: "Correctness", outcome: "found", explanation: 1 },
        { id: "D1", kind: "decoy", title: "Cap at 100", category: "Decoy", outcome: "false_alarm", explanation: null },
      ],
      "code",
    )
    expect(qs).toHaveLength(3)
    expect(qs[0].why).toMatch(/missed/)
  })
})
