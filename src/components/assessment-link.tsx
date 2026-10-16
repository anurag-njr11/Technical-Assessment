import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Copy } from 'lucide-react'

/** Shareable candidate link for an assessment: copyable URL plus QR code. */
export function AssessmentLink({ token }: { token: string }) {
  const url = `${window.location.origin}/a/${token}`
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this link', url)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="rounded-lg border border-border bg-white p-2">
        <QRCodeSVG value={url} size={128} aria-label="Assessment QR code" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-xs text-muted-foreground">Share this link or QR code. Each candidate who opens it gets their own attempt.</p>
        <div className="flex gap-2">
          <input readOnly value={url} aria-label="Assessment link" onFocus={(e) => e.target.select()}
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-xs" />
          <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  )
}
