import { describe, expect, it } from 'vitest'
import { cleanError } from '@/components/rb'

describe('cleanError', () => {
  it('extracts the server message from a multi-line Convex error', () => {
    const err = new Error("[CONVEX A(builds:ask)] [Request ID: abe1] Server Error\nUncaught Error: The agent didn't reply this time.\n    at handler (../convex/builds.ts:160:11)")
    expect(cleanError(err)).toBe("The agent didn't reply this time.")
  })
  it('hides redacted server errors behind the fallback', () => {
    expect(cleanError(new Error('[CONVEX A(builds:ask)] [Request ID: abe1] Server Error'), 'Try again')).toBe('Try again')
    expect(cleanError('nope', 'Try again')).toBe('Try again')
  })
})
