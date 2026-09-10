/**
 * Shared override logic for the System Prompt Editor: the one implementation
 * used both by the host-side `system-prompt/assemble` waterfall listener
 * (stored values, every assembly) and by the preview endpoint (draft values,
 * on top of an assembly the stored waterfall already shaped).
 *
 * The helper touches everything this plugin owns: the order-0 persona, the
 * tool-guidance prose band (orders 100-199), the custom text section
 * (configurable `order`, default 200), and any section named in the generic
 * `sections` map (the shared catalog's curated sections and unknown
 * third-party sections alike). Everything else in the assembly (other
 * plugins' sections, tool schemas, variables) is left untouched.
 *
 * Empty override values are "leave the defaults alone": a section the plugin
 * has nothing to say about stays exactly as the registry contributed it, so
 * clearing a stored value restores the deployment default without this plugin
 * ever having to know what it was.
 *
 * @module dsh-system-prompt-editor/overrides
 */

import type { AssembledSection, PromptAssembly } from '@deepseek-ai/dsh-system-prompt'
import { PERSONA_SECTION } from '@deepseek-ai/dsh-system-prompt'
import { CUSTOM_SECTION, TOOL_GUIDANCE_ORDER, TOOL_GUIDANCE_SECTION, TOOL_SECTION_PREFIX } from './catalog.ts'

export { TOOL_GUIDANCE_ORDER, TOOL_GUIDANCE_SECTION, TOOL_SECTION_PREFIX }

/** One draft/stored override set. A field absent or empty means "leave as-is". */
export interface SystemPromptOverrides {
  /** Replacement text for the order-0 `deployment:persona` section. */
  readonly persona?: string
  /** Replacement text for the whole tool-guidance prose band (orders 100-199). */
  readonly toolGuidance?: string
  /** Replacement text for this plugin's custom section. */
  readonly text?: string
  /** Per-section replacements keyed by the section's registry name (curated catalog sections and unknown third-party sections). */
  readonly sections?: Readonly<Record<string, string>>
}

/** Whether a section name belongs to the per-tool guidance band convention. */
function isToolSection(name: string): boolean {
  return name.startsWith(TOOL_SECTION_PREFIX)
}

/**
 * Apply non-empty overrides to an assembled prompt, in place.
 * @param assembly - the assembled prompt to mutate.
 * @param overrides - the overrides to apply; empty values leave defaults alone.
 * @param options - optional insertion-order resolver: given a section name,
 * returns that section's canonical order (so a section absent from this
 * assembly - e.g. a per-agent one in the scope-less preview - can be spliced
 * into the position it would render at). Without it, absent sections append.
 */
export function applyOverrides(
  assembly: PromptAssembly,
  overrides: SystemPromptOverrides,
  options: { readonly orderOf?: (name: string) => number | undefined } = {},
): void {
  if (overrides.persona !== undefined && overrides.persona !== '') {
    const slot = assembly.sections.find(section => section.name === PERSONA_SECTION)
    if (slot !== undefined) {
      slot.text = overrides.persona
    } else {
      assembly.sections.push({ name: PERSONA_SECTION, text: overrides.persona })
    }
  }

  if (overrides.toolGuidance !== undefined && overrides.toolGuidance !== '') {
    const existing = assembly.sections.find(section => section.name === TOOL_GUIDANCE_SECTION)
    if (existing !== undefined) {
      existing.text = overrides.toolGuidance
    } else {
      // Splice the replacement at the first tool section's position so the
      // band keeps its place in the render order; every other tool section is
      // dropped. Without any tool section, append at the end.
      const firstToolIndex = assembly.sections.findIndex(section => isToolSection(section.name))
      const replacement: AssembledSection = { name: TOOL_GUIDANCE_SECTION, text: overrides.toolGuidance }
      if (firstToolIndex < 0) {
        assembly.sections.push(replacement)
      } else {
        assembly.sections = [
          ...assembly.sections.slice(0, firstToolIndex),
          replacement,
          ...assembly.sections.slice(firstToolIndex).filter(section => !isToolSection(section.name)),
        ]
      }
    }
  }

  if (overrides.text !== undefined && overrides.text !== '') {
    const slot = assembly.sections.find(section => section.name === CUSTOM_SECTION)
    if (slot !== undefined) {
      slot.text = overrides.text
    } else {
      assembly.sections.push({ name: CUSTOM_SECTION, text: overrides.text })
    }
  }

  if (overrides.sections !== undefined) {
    for (const [name, value] of Object.entries(overrides.sections)) {
      if (value === '') continue
      const slot = assembly.sections.find(section => section.name === name)
      if (slot !== undefined) {
        slot.text = value
        continue
      }
      // Absent in THIS assembly: insert at the canonical position when the
      // order resolver knows the section, otherwise append. Unknown-order
      // existing sections never split (the first known-later section anchors).
      const order = options.orderOf?.(name)
      let index = assembly.sections.length
      if (order !== undefined) {
        const anchor = assembly.sections.findIndex(section => {
          const known = options.orderOf?.(section.name)
          return known !== undefined && known > order
        })
        if (anchor >= 0) index = anchor
      }
      assembly.sections.splice(index, 0, { name, text: value })
    }
  }
}
