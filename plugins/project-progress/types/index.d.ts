export type ProgressSummary = {
  name: string
  done: number
  total: number
  current: string | null
  next: string | null
}

// Sub-steps Claude proposed for a to-do, waiting for /todo accept.
export type Proposal = { ref: string; parentText: string; texts: string[] }

declare module 'claude-code' {
  interface PluginState {
    'project-progress': { summary: ProgressSummary | null; proposal: Proposal | null }
  }
}
