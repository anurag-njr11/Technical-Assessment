import { describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { AgentPR, EvidenceReport, type Finding } from "@/components/evidence"
import { AssessmentLink } from "@/components/assessment-link"
import { PAY_217 } from "@/lib/scenario"

const vote = (judge: string, decision: boolean, eventIds: string[] = []) => ({
  judge, model: `m-${judge}`, decision, evidence: decision ? "asked the AI why it used string SQL" : "", eventIds, valid: true,
})
const findings: Finding[] = [
  { id: "I1", title: "SQL injection", dimension: "issueDetection", kind: "detected", question: "Did they catch it?", votes: [vote("A", true, ["e1"]), vote("B", true), vote("C", true)], agreement: "3/3", confidence: "high", needsReview: false },
  { id: "I2", title: "Off-by-one", dimension: "issueDetection", kind: "missed", question: "Did they catch the offset?", votes: [vote("A", true), vote("B", false), vote("C", false)], agreement: "2/3", confidence: "low", needsReview: true },
  { id: "A1", title: "Challenged parse_date_safe", dimension: "challengeAssumptions", kind: "detected", question: "?", votes: [vote("A", true)], agreement: "1/1", confidence: "medium", needsReview: false },
  { id: "B3", title: "Blindly accepted faulty output", goodTitle: "Didn't blindly accept faulty output", good: false, dimension: "trustCalibration", kind: "behavior", question: "?", votes: [vote("A", false), vote("B", false), vote("C", false)], agreement: "0/3", confidence: "high", needsReview: false },
  { id: "A7", title: "Rejected a sound assumption: idempotent replay", goodTitle: "Kept a sound assumption: idempotent replay", good: false, dimension: "challengeAssumptions", kind: "false_positive", question: "?", votes: [vote("A", false), vote("B", false), vote("C", false)], agreement: "0/3", confidence: "high", needsReview: false },
]

describe("evidence-first report", () => {
  it("shows dimensions, disagreements, grouped findings and jumps to cited events", () => {
    Element.prototype.scrollIntoView = () => {}
    render(
      <EvidenceReport
        overall={72}
        band="Meets bar"
        trajectory={{ dimensions: [{ key: "issueDetection", label: "Issue detection", score: 64, detail: "found 1 of 2" }], findings }}
        code="final()"
        events={[
          { id: "e1", t: 1000, type: "ai_prompt", data: "why string SQL?" },
          { id: "e2", t: 2000, type: "ai_response", data: JSON.stringify({ text: "fixed", code: "q(?)" }), tokens: { input: 10, output: 5 } },
          { id: "e3", t: 2001, type: "fault_injected", data: "F1|e2" },
        ]}
      />,
    )
    expect(screen.getByText("found 1 of 2")).toBeInTheDocument()
    expect(screen.getByText("Judge disagreements")).toBeInTheDocument()
    expect(screen.getByText("Caught")).toBeInTheDocument()
    expect(screen.getByText("Concerns")).toBeInTheDocument()
    expect(screen.getByText("Needs a human look")).toBeInTheDocument() // A1 has only one usable vote
    // Clean negative checks read as good behaviour, never as mistakes.
    expect(screen.getByText("Good behaviour")).toBeInTheDocument()
    expect(screen.getByText("Didn't blindly accept faulty output")).toBeInTheDocument()
    expect(screen.getByText("Kept a sound assumption: idempotent replay")).toBeInTheDocument()
    expect(screen.queryByText("Blindly accepted faulty output")).toBeNull()
    expect(screen.queryByText(/False positives/)).toBeNull()
    expect(screen.getByText("Human review recommended")).toBeInTheDocument()
    expect(screen.getByText(/Planted fault F1/)).toBeInTheDocument()
    expect(screen.getByText("15 tokens")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "e1" }))
    expect(document.getElementById("ev-e1")?.className).toMatch(/ring-warning/)
  })

  it("marks the agent assumptions the candidate challenged", () => {
    render(<AgentPR scenario={PAY_217} findings={findings} />)
    expect(screen.getByText("Challenged")).toBeInTheDocument()
  })

  it("shows a copyable candidate link with a QR code", () => {
    render(<AssessmentLink token="abc" />)
    expect((screen.getByLabelText("Assessment link") as HTMLInputElement).value).toBe(`${window.location.origin}/a/abc`)
    expect(screen.getByLabelText("Assessment QR code")).toBeInTheDocument()
  })
})
