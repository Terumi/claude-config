export type ProgressSummary = { name: string; done: number; total: number; next: string | null }

declare module 'claude-code' {
  interface PluginState {
    'project-progress': { summary: ProgressSummary | null }
  }
}
