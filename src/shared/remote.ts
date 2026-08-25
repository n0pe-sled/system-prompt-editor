/**
 * Wire contract between the two halves of the System Prompt Editor: the
 * preview invocation descriptor, its payload types, and boundary validators.
 *
 * This module is deliberately dependency-free at runtime (pure JSON-safe data
 * plus tiny hand-rolled validators), because it is bundled into BOTH halves:
 * the node half (host registration) and the browser half (client `$mount`).
 * The client's Remote `$mount` requires strict codecs, so the descriptor uses
 * `{ mode: 'strict', schema }` with these validators instead of the plan's
 * `src-json` codecs.
 *
 * @module dsh-system-prompt-editor/remote
 */

import type {
  InvocationDescriptor,
  RemoteResult,
  TypertSchema,
} from '@deepseek-ai/dsh-typert-protocol'

/** The three drafts one Preview click sends (every field, always present). */
export interface SystemPromptDrafts {
  /** Custom system prompt text (order-200 section). */
  readonly text: string
  /** Persona override (order-0 section). */
  readonly persona: string
  /** Tool-guidance override (orders 100–199). */
  readonly toolGuidance: string
}

/** Current stored values (not drafts), for the Load buttons. */
export interface SystemPromptStoredValues {
  readonly text: string
  readonly persona: string
  readonly toolGuidance: string
}

/** Which band an assembled section belongs to, for the annotated display. */
export type SystemPromptSectionBand =
  /** The fixed harness identity section (order −100). */
  | 'identity'
  /** The deployment persona section (order 0). */
  | 'persona'
  /** Tool-guidance prose: this plugin's replacement or the per-tool sections. */
  | 'tool-guidance'
  /** This plugin's custom text section (configurable order, default 200). */
  | 'custom'
  /** Any other plugin's section. */
  | 'other'

/** One assembled section, with the display order when the plugin knows it. */
export interface SystemPromptPreviewSection {
  /** Registry name of the contributing section. */
  readonly name: string
  /** The resolved (possibly draft-overridden) section text. */
  readonly text: string
  /** Canonical order when known: identity −100, persona 0, tool guidance 150, custom 200. */
  readonly order?: number
  /** Band classification for the annotated display. */
  readonly band: SystemPromptSectionBand
}

/** The full-prompt preview response. */
export interface SystemPromptPreviewResult {
  /** The full assembled prompt with drafts applied, variables interpolated. */
  readonly rendered: string
  /** Per-section breakdown for the annotated display (rendered text). */
  readonly sections: readonly SystemPromptPreviewSection[]
  /** Current stored values (stored, not draft) for the Load buttons. */
  readonly effective: SystemPromptStoredValues
  /** Present when strict variable interpolation failed (rendered then empty). */
  readonly error?: string
}

/** Client-visible outcome of one Preview click. */
export type SystemPromptEditorPreviewOutcome =
  | { readonly status: 'previewed'; readonly result: SystemPromptPreviewResult }
  | { readonly status: 'error'; readonly message: string }

/** Cordis service key of the preview receiver, also the wire namespace. */
export const PREVIEW_SERVICE = 'systemPromptEditorPreview'
/** Endpoint namespace/method of the preview invocation. */
export const PREVIEW_ENDPOINT = `${PREVIEW_SERVICE}/preview`
/** Stable generated-style identity of the preview invocation. */
export const PREVIEW_ID = `dsh-system-prompt-editor#${PREVIEW_SERVICE}.preview`

/** Type symbol of the drafts boundary value (diagnostics only). */
const DRAFTS_TYPE = 'dsh-system-prompt-editor#SystemPromptDrafts'
/** Type symbol of the preview result boundary value (diagnostics only). */
const RESULT_TYPE = 'dsh-system-prompt-editor#SystemPromptPreviewResult'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/** Boundary validator for the drafts argument. */
const draftsSchema: TypertSchema<SystemPromptDrafts> = {
  parse(value: unknown): SystemPromptDrafts {
    if (!isRecord(value)) throw new TypeError('drafts must be a plain object')
    const { text, persona, toolGuidance } = value
    if (!isString(text) || !isString(persona) || !isString(toolGuidance)) {
      throw new TypeError('drafts.text, drafts.persona and drafts.toolGuidance must all be strings')
    }
    return { text, persona, toolGuidance }
  },
}

/** Boundary validator for the preview result. */
const resultSchema: TypertSchema<SystemPromptPreviewResult> = {
  parse(value: unknown): SystemPromptPreviewResult {
    if (!isRecord(value)) throw new TypeError('preview result must be a plain object')
    const { rendered, sections, effective, error } = value
    if (!isString(rendered)) throw new TypeError('preview result rendered must be a string')
    if (!Array.isArray(sections)) throw new TypeError('preview result sections must be an array')
    if (!isRecord(effective)) throw new TypeError('preview result effective must be a plain object')
    const { text, persona, toolGuidance } = effective
    if (!isString(text) || !isString(persona) || !isString(toolGuidance)) {
      throw new TypeError('preview result effective fields must all be strings')
    }
    const parsedSections: SystemPromptPreviewSection[] = sections.map((entry, index) => {
      if (!isRecord(entry) || !isString(entry.name) || !isString(entry.text)) {
        throw new TypeError(`preview result section ${String(index)} must have string name and text`)
      }
      const band = entry.band
      if (band !== 'identity' && band !== 'persona' && band !== 'tool-guidance'
        && band !== 'custom' && band !== 'other') {
        throw new TypeError(`preview result section ${String(index)} has an invalid band`)
      }
      const order = entry.order
      if (order !== undefined && (typeof order !== 'number' || !Number.isFinite(order))) {
        throw new TypeError(`preview result section ${String(index)} has an invalid order`)
      }
      const parsed: SystemPromptPreviewSection = { name: entry.name, text: entry.text, band }
      const withOrder: SystemPromptPreviewSection = order === undefined
        ? parsed
        : { ...parsed, order }
      return withOrder
    })
    const parsed: SystemPromptPreviewResult = {
      rendered,
      sections: parsedSections,
      effective: { text, persona, toolGuidance },
    }
    if (error === undefined) return parsed
    if (!isString(error)) throw new TypeError('preview result error must be a string')
    return { ...parsed, error }
  },
}

/** The preview invocation, registered by the host and mounted by the client. */
export const PREVIEW_DESCRIPTOR: InvocationDescriptor = {
  id: PREVIEW_ID,
  service: PREVIEW_SERVICE,
  namespace: PREVIEW_SERVICE,
  method: 'preview',
  invocation: { kind: 'direct' },
  parameters: [{
    name: 'drafts',
    wire: 'drafts',
    source: 'json',
    codec: { mode: 'strict', typeSymbol: DRAFTS_TYPE, schema: draftsSchema },
  }],
  result: { mode: 'strict', typeSymbol: RESULT_TYPE, schema: resultSchema },
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    [PREVIEW_ENDPOINT](drafts: SystemPromptDrafts): Promise<RemoteResult<SystemPromptPreviewResult>>
  }
  interface TypertRemoteNamespaceMap {
    [PREVIEW_SERVICE]: {
      preview(drafts: SystemPromptDrafts): Promise<RemoteResult<SystemPromptPreviewResult>>
    }
  }
}
