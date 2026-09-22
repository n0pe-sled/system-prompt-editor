export interface SystemPromptProfile {
  readonly text: string
  readonly persona: string
  readonly toolGuidance: string
  readonly sections: Readonly<Record<string, string>>
}
