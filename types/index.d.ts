export type PromptList = string[]

declare module 'claude-code' {
  interface PluginState {
    'prompt-nav': { prompts: PromptList; cursor: number | null; isHidden: boolean }
  }
}
