/**
 * Host (Node) half of the System Prompt Editor plugin.
 *
 * Registers the `system-prompt-editor` settings namespace (durable, per-machine
 * storage through the settings provider — `$DSH_HOME/settings.yaml` under the
 * shipped file provider) with three fields — custom text, persona, and tool
 * guidance — and contributes to every system prompt assembly:
 *
 * - the custom text section (configurable `order`, default 200) whose text is
 *   a provider evaluated at EVERY assembly, so a save changes the next
 *   request's prompt with no re-registration, no restart, and no reload;
 * - a `system-prompt/assemble` waterfall listener that applies the stored
 *   persona and tool-guidance overrides via {@link applyOverrides} — the same
 *   helper the preview endpoint reuses with drafts;
 * - a runtime-registered Typert endpoint (`systemPromptEditorPreview/preview`)
 *   that assembles the full prompt, applies draft overrides, renders it, and
 *   returns the whole model-visible prompt plus a per-section breakdown.
 */

import Schema from '@deepseek-ai/schemastery'
import type z from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { PERSONA_SECTION, PERSONA_ORDER } from '@deepseek-ai/dsh-system-prompt'
// Type-only: pull the ctx.settings / ctx.systemPrompt Context merges.
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-system-prompt'
// Type-only: the ctx.typert.register() augmentation and TypertContribution.
import type {} from '@deepseek-ai/dsh-typert-registry'
import type { TypertContribution, TypertPackageModel } from '@deepseek-ai/dsh-typert-registry'
import { bindTypertRemote, type TypertGatewayBinding } from '@deepseek-ai/dsh-typert-protocol'
import { applyOverrides, TOOL_GUIDANCE_ORDER, TOOL_GUIDANCE_SECTION } from './shared/overrides.ts'
import {
  PREVIEW_DESCRIPTOR, PREVIEW_SERVICE,
  type SystemPromptDrafts, type SystemPromptPreviewResult, type SystemPromptPreviewSection,
  type SystemPromptSectionBand, type SystemPromptStoredValues,
} from './shared/remote.ts'

export { applyOverrides } from './shared/overrides.ts'
export type { SystemPromptOverrides } from './shared/overrides.ts'
export type {
  SystemPromptDrafts, SystemPromptPreviewResult, SystemPromptPreviewSection,
  SystemPromptSectionBand, SystemPromptStoredValues, SystemPromptEditorPreviewOutcome,
} from './shared/remote.ts'

export const name = 'system-prompt-editor'

/** Services that must be mounted before this plugin runs. */
export const inject = ['settings', 'systemPrompt', 'typert']

/** Config: where in the assembled system prompt the custom text lands. */
export interface Config {
  order: number
}
export const Config: z<Config> = Schema.object({
  order: Schema.number().default(200),
})

const NAMESPACE = 'system-prompt-editor' as SettingsNamespace
const SECTION_NAME = 'user:system-prompt-editor'
const IDENTITY_SECTION = 'harness:identity'
/** Empty model for the Typert contribution: no generated reflection is claimed. */
const EMPTY_MODEL: TypertPackageModel = { services: [], events: [], objects: [] }

/** The stored user section of this plugin's settings namespace. */
export interface SettingsSection {
  text: string
  persona: string
  toolGuidance: string
}

/** The live receiver object the gateway dispatches `/api/systemPromptEditorPreview/preview` to. */
interface SystemPromptEditorReceiver {
  /** Set after construction — the binding must reference the receiver itself. */
  typertRemote: TypertGatewayBinding<SystemPromptEditorReceiver>
  preview(drafts: SystemPromptDrafts): Promise<SystemPromptPreviewResult>
}

/** The identity section's display order (registered by dsh-system-prompt at −100). */
const IDENTITY_ORDER = -100

/** Classify one assembled section into the band the UI annotates. */
function bandOf(name: string, customSection: string): SystemPromptSectionBand {
  if (name === IDENTITY_SECTION) return 'identity'
  if (name === PERSONA_SECTION) return 'persona'
  if (name === TOOL_GUIDANCE_SECTION || name.startsWith('tool:')) return 'tool-guidance'
  if (name === customSection) return 'custom'
  return 'other'
}

/** The display order of one classified section, when this plugin knows it. */
function knownOrder(band: SystemPromptSectionBand, customOrder: number): number | undefined {
  switch (band) {
    case 'identity': return IDENTITY_ORDER
    case 'persona': return PERSONA_ORDER
    case 'tool-guidance': return TOOL_GUIDANCE_ORDER
    case 'custom': return customOrder
    case 'other': return undefined
  }
}

export function apply(ctx: Context, config: Config) {
  // Durable per-machine storage (provider: dsh-settings-file → $DSH_HOME/settings.yaml).
  const sectionSchema: z<SettingsSection> = Schema.object({
    text: Schema.string().default(''),
    persona: Schema.string().default(''),
    toolGuidance: Schema.string().default(''),
  })
  const scope = ctx.settings.register(NAMESPACE, sectionSchema)

  // One registration, always current: text is a provider evaluated at each assembly.
  ctx.systemPrompt.section({
    name: SECTION_NAME,
    order: config.order,
    text: () => scope.get()?.text ?? '',
  })

  // Stored overrides applied at every assembly. The listener reads the scope
  // at call time, so a save is live on the very next request; empty stored
  // values leave the deployment persona and tool guidance untouched.
  ctx.on('system-prompt/assemble', async (assembly, _context, next) => {
    const stored = scope.get()
    applyOverrides(assembly, {
      persona: stored?.persona,
      toolGuidance: stored?.toolGuidance,
    })
    return next()
  })

  // The preview receiver: assemble (stored overrides apply through the
  // waterfall), apply DRAFT overrides on top, then render. Variable
  // interpolation is strict, and a scope-less assembly lacks the per-agent
  // variables, so a render failure is reported as `error` instead of thrown.
  const receiver: SystemPromptEditorReceiver = {
    // The binding is assigned below — it must reference the receiver itself,
    // which does not exist until the object literal completes.
    typertRemote: undefined as unknown as TypertGatewayBinding<SystemPromptEditorReceiver>,
    async preview(drafts: SystemPromptDrafts): Promise<SystemPromptPreviewResult> {
      const assembly = await ctx.systemPrompt.assemble()
      applyOverrides(assembly, drafts)
      const stored = scope.get()
      const effective: SystemPromptStoredValues = {
        text: stored?.text ?? '',
        persona: stored?.persona ?? '',
        toolGuidance: stored?.toolGuidance ?? '',
      }
      const sections: SystemPromptPreviewSection[] = assembly.sections.map(({ name, text }) => {
        const band = bandOf(name, SECTION_NAME)
        const order = knownOrder(band, config.order)
        const section: SystemPromptPreviewSection = { name, text, band }
        return order === undefined ? section : { ...section, order }
      })
      try {
        const rendered = renderPrompt(assembly)
        return { rendered, sections, effective }
      } catch (error) {
        return {
          rendered: '',
          sections,
          effective,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  }
  receiver.typertRemote = bindTypertRemote(receiver, PREVIEW_SERVICE, { namespace: PREVIEW_SERVICE })
  // A plain provided object resolves through the gateway's receiver lookup
  // (`receiverContext.get(service)`); the binding only needs to be consistent.
  ctx.provide(PREVIEW_SERVICE, receiver)

  // Register the endpoint so the gateway claims `/api/systemPromptEditorPreview/preview`
  // and dispatches to the receiver above.
  const contribution: TypertContribution = {
    package: 'dsh-system-prompt-editor',
    face: 'host',
    schemas: [],
    model: EMPTY_MODEL,
    invocations: [PREVIEW_DESCRIPTOR],
  }
  ctx.typert.register(contribution)
}
