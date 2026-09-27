/**
 * Shared settings-section shape for the System Prompt Editor: the profile
 * snapshot type, bundled into BOTH halves (node and browser) so the host
 * schema and the client UI agree on what one saved profile is.
 *
 * A profile is the complete editable system prompt snapshot: the three
 * free-text fields plus the per-section map, exactly what the editor shows.
 * Profiles are plain data (JSON-compatible), so they round-trip through the
 * settings document like every other field of the namespace.
 *
 * @module dsh-system-prompt-editor/section
 */

/**
 * Name of the profile that holds the user's baseline prompt. The panel creates
 * it empty on first use and refuses to delete it, so a reset always has
 * somewhere to land: overwriting it redefines the baseline, and applying it is
 * what Clear all does after it unsets the live overrides.
 */
export const DEFAULT_PROFILE_NAME = 'Default'

/** One saved profile: the full editable system prompt as one snapshot. */
export interface SystemPromptProfile {
  /** Custom system prompt text (order-200 section). */
  readonly text: string
  /** Persona override (order-0 section). */
  readonly persona: string
  /** Tool-guidance override (orders 100–199). */
  readonly toolGuidance: string
  /** Per-section overrides keyed by registry name (empty value = keep default). */
  readonly sections: Readonly<Record<string, string>>
  /**
   * When this snapshot was last written (ISO 8601). Display only: a document
   * saved before this field existed still loads, it just shows no timestamp.
   */
  readonly savedAt?: string
}
