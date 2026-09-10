/**
 * Host (Node) half of the System Prompt Editor plugin.
 *
 * Registers the `system-prompt-editor` settings namespace (durable, per-machine
 * storage through the settings provider — `$DSH_HOME/settings.yaml` under the
 * shipped file provider) with the custom text, persona, and tool-guidance
 * fields plus a generic per-section map keyed by registry name, and
 * contributes to every system prompt assembly:
 *
 * - the custom text section (configurable `order`, default 200) whose text is
 *   a provider evaluated at EVERY assembly, so a save changes the next
 *   request's prompt with no re-registration, no restart, and no reload;
 * - a `system-prompt/assemble` waterfall listener that applies the stored
 *   overrides — persona, tool-guidance band, custom text, and every named
 *   section — via {@link applyOverrides}, the same helper the preview
 *   endpoint reuses with drafts;
 * - a runtime-registered Typert endpoint (`systemPromptEditorPreview/preview`)
 *   that assembles the full prompt, applies draft overrides, renders it, and
 *   returns the whole model-visible prompt plus a per-section breakdown.
 *
 * The editable section surface is driven by the shared catalog
 * ({@link ./shared/catalog.ts}), which pins the section names/orders of the
 * dsh release this plugin builds against.
 */

import Schema from '@deepseek-ai/schemastery'
import type z from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import type { PromptAssembly, AssembledSection } from '@deepseek-ai/dsh-system-prompt'
// Type-only: pull the ctx.settings / ctx.systemPrompt Context merges.
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-system-prompt'
// Type-only: the ctx.typert.register() augmentation and TypertContribution.
import type {} from '@deepseek-ai/dsh-typert-registry'
import type { TypertContribution, TypertPackageModel } from '@deepseek-ai/dsh-typert-registry'
import { bindTypertRemote, type TypertGatewayBinding } from '@deepseek-ai/dsh-typert-protocol'
import { applyOverrides } from './shared/overrides.ts'
import {
  bandOfSection, knownSectionOrder, CUSTOM_SECTION,
  TOOL_GUIDANCE_SECTION, TOOL_SECTION_PREFIX,
} from './shared/catalog.ts'
import {
  PREVIEW_DESCRIPTOR, PREVIEW_SERVICE,
  type SystemPromptDrafts, type SystemPromptPreviewResult, type SystemPromptPreviewSection,
  type SystemPromptSectionBand, type SystemPromptStoredValues,
} from './shared/remote.ts'

export { applyOverrides } from './shared/overrides.ts'
export { bandOfSection, knownSectionOrder, SECTION_CATALOG, MANAGED_SECTIONS } from './shared/catalog.ts'
export type { SystemPromptSectionBand } from './shared/catalog.ts'
export type { SystemPromptOverrides } from './shared/overrides.ts'
export type {
  SystemPromptDrafts, SystemPromptPreviewResult, SystemPromptPreviewSection,
  SystemPromptStoredValues, SystemPromptEditorPreviewOutcome,
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
/** Empty model for the Typert contribution: no generated reflection is claimed. */
const EMPTY_MODEL: TypertPackageModel = { services: [], events: [], objects: [] }

/** The stored user section of this plugin's settings namespace. */
export interface SettingsSection {
  text: string
  persona: string
  toolGuidance: string
  /** Per-section overrides keyed by registry name (curated and third-party sections). */
  sections: Record<string, string>
}

/** The live receiver object the gateway dispatches `/api/systemPromptEditorPreview/preview` to. */
interface SystemPromptEditorReceiver {
  /** Set after construction — the binding must reference the receiver itself. */
  typertRemote: TypertGatewayBinding<SystemPromptEditorReceiver>
  preview(drafts: SystemPromptDrafts): Promise<SystemPromptPreviewResult>
}

/** The display order of one classified section, when this plugin knows it. */
function knownOrder(name: string, customOrder: number): number | undefined {
  if (name === CUSTOM_SECTION) return customOrder
  return knownSectionOrder(name)
}

/** Valid variable names: how they are written between the braces (same rule as the registry). */
const VARIABLE_NAME = /^[a-z][a-z0-9_]*$/
/** A complete `{{...}}` reference group at the scan position. */
const GROUP_AT = /^\{\{([^{}]*)\}\}/

/**
 * Lenient preview interpolation: an unresolved reference stays literal.
 *
 * Real assemblies always carry per-agent values for `{{model}}`/`{{cwd}}`
 * (the agent-loop registers those variables globally but their providers need
 * `context.agent`, which a scope-less preview assembly does not have — so the
 * strict {@link renderPrompt} throws on the default web persona). The preview
 * must NEVER error out of a legitimate default deployment; it renders
 * resolved values where they exist and leaves the rest as `{{name}}` text,
 * sections dropping empty, joined with blank lines, exactly like renderPrompt.
 * @param assembly - the assembled prompt to render for display.
 * @returns the leniently rendered prompt.
 */
function renderPreviewPrompt(assembly: PromptAssembly): string {
  return assembly.sections
    .map((section: AssembledSection) => interpolatePreview(section.text, assembly.variables))
    .filter(text => text.length > 0)
    .join('\n\n')
}

/** Interpolate {@link text} leniently for the preview display. */
function interpolatePreview(text: string, variables: Record<string, string | undefined>): string {
  let result = ''
  let last = 0
  for (let open = text.indexOf('{{'); open >= 0; open = text.indexOf('{{', last)) {
    const group = GROUP_AT.exec(text.slice(open))
    if (group === null) {
      // No complete group: copy the opening braces literally and keep scanning.
      result += text.slice(last, open + 2)
      last = open + 2
      continue
    }
    const name = group[0].slice(2, -2)
    const value = VARIABLE_NAME.test(name) && Object.hasOwn(variables, name) ? variables[name] : undefined
    if (value === undefined) {
      // Unresolved (unknown, unvalued, or malformed reference): keep literal.
      result += text.slice(last, open + group[0].length)
    } else {
      result += text.slice(last, open) + value
    }
    last = open + group[0].length
  }
  return result + text.slice(last)
}

/** The soft `agentDefaultModel` service face (mounted by dsh-agent-default-model). */
interface AgentDefaultModelFacade {
  currentSelection(): { provider: string; model: string; reasoningEffort?: string }
}

/**
 * Best-effort preview context: a scope-less assembly lacks the per-agent
 * `{{model}}`/`{{provider}}` values, but the machine-global default model
 * selection is real and cheap to read. `{{cwd}}` has no scope-less source
 * (it comes from the session's validated cwd) and stays literal.
 * @param ctx - the plugin context.
 * @returns the filled variables, or an empty record when nothing is available.
 */
function previewVariableFallbacks(ctx: Context): Record<string, string> {
  const selection = (ctx.get('agentDefaultModel') as AgentDefaultModelFacade | undefined)?.currentSelection?.()
  if (selection === undefined) return {}
  return {
    provider: selection.provider,
    model: selection.model,
  }
}

export function apply(ctx: Context, config: Config) {
  // Durable per-machine storage (provider: dsh-settings-file → $DSH_HOME/settings.yaml).
  const sectionSchema: z<SettingsSection> = Schema.object({
    text: Schema.string().default(''),
    persona: Schema.string().default(''),
    toolGuidance: Schema.string().default(''),
    sections: Schema.dict(Schema.string()).default({}),
  })
  const scope = ctx.settings.register(NAMESPACE, sectionSchema)

  // Deployment per-tool guidance snapshot. The per-tool sections register per
  // agent, so a scope-less assembly (the preview) never contains them; the
  // waterfall listener below sees EVERY assembly — real sessions included —
  // and snapshots the last real per-tool guidance here, so the preview and the
  // tool-guidance Load have a faithful band to show instead of nothing.
  const toolGuidanceSnapshot = new Map<string, string>()

  // One registration, always current: text is a provider evaluated at each assembly.
  ctx.systemPrompt.section({
    name: CUSTOM_SECTION,
    order: config.order,
    text: () => scope.get()?.text ?? '',
  })

  // Stored overrides applied at every assembly. The listener reads the scope
  // at call time, so a save is live on the very next request; empty stored
  // values leave the deployment persona, tool guidance, and other sections
  // untouched.
  ctx.on('system-prompt/assemble', async (assembly, _context, next) => {
    const stored = scope.get()
    // Snapshot the deployment band BEFORE the stored override collapses it, so
    // the preview/Load always has the real per-tool guidance available.
    for (const section of assembly.sections) {
      if (section.name.startsWith(TOOL_SECTION_PREFIX)) {
        toolGuidanceSnapshot.set(section.name, section.text)
      }
    }
    applyOverrides(assembly, {
      persona: stored?.persona,
      toolGuidance: stored?.toolGuidance,
      sections: stored?.sections,
    }, { orderOf: knownSectionOrder })
    return next()
  })

  // The preview receiver: assemble (stored overrides apply through the
  // waterfall), apply DRAFT overrides on top, then render leniently. The
  // scope-less assembly cannot know per-agent values (`{{cwd}}` comes from the
  // session), so the preview fills the default model selection where it exists
  // and renders every other unresolved reference literally instead of failing.
  const receiver: SystemPromptEditorReceiver = {
    // The binding is assigned below — it must reference the receiver itself,
    // which does not exist until the object literal completes.
    typertRemote: undefined as unknown as TypertGatewayBinding<SystemPromptEditorReceiver>,
    async preview(drafts: SystemPromptDrafts): Promise<SystemPromptPreviewResult> {
      const assembly = await ctx.systemPrompt.assemble()
      applyOverrides(assembly, drafts, { orderOf: knownSectionOrder })
      // Best-effort real values for the default model selection, then a lenient
      // render: anything still unresolved stays literal, so a stock deployment
      // persona (`{{model}}`/`{{cwd}}`) previews instead of erroring.
      for (const [name, value] of Object.entries(previewVariableFallbacks(ctx))) {
        if (assembly.variables[name] === undefined) assembly.variables[name] = value
      }
      // Replay the snapshotted per-tool guidance band when this scope-less
      // assembly has no tool sections and no band replacement (no stored
      // override, no draft): the tool band is per-agent, so this is the only
      // faithful approximation, and it is what Load's tool-guidance card picks
      // up when nothing is stored.
      const hasToolBand = assembly.sections.some(section =>
        section.name.startsWith(TOOL_SECTION_PREFIX) || section.name === TOOL_GUIDANCE_SECTION)
      if (!hasToolBand && toolGuidanceSnapshot.size > 0) {
        const anchor = assembly.sections.findIndex(section => {
          const order = knownSectionOrder(section.name)
          return order !== undefined && order > 100
        })
        const entries = [...toolGuidanceSnapshot.entries()].map(([name, text]) => ({ name, text }))
        if (anchor < 0) {
          assembly.sections.push(...entries)
        } else {
          assembly.sections.splice(anchor, 0, ...entries)
        }
      }
      const stored = scope.get()
      const effective: SystemPromptStoredValues = {
        text: stored?.text ?? '',
        persona: stored?.persona ?? '',
        toolGuidance: stored?.toolGuidance ?? '',
        sections: stored?.sections ?? {},
      }
      const sections: SystemPromptPreviewSection[] = assembly.sections.map(({ name, text }) => {
        const band: SystemPromptSectionBand = bandOfSection(name)
        const order = knownOrder(name, config.order)
        const section: SystemPromptPreviewSection = { name, text, band }
        return order === undefined ? section : { ...section, order }
      })
      try {
        const rendered = renderPreviewPrompt(assembly)
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
