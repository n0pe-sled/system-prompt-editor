/**
 * Shared section catalog for the System Prompt Editor: the single source of
 * truth for which assembled-prompt sections this plugin can edit, their
 * canonical orders, their display labels, and how each value is stored.
 *
 * Bundled into BOTH halves (node and browser), so it is deliberately
 * dependency-free: plain data plus pure helpers. Section names and orders are
 * internal contracts of the pinned dsh release (`0.1.1-rc.2`); treat this
 * catalog as version-pinned (see README "Version pinning").
 *
 * @module dsh-system-prompt-editor/catalog
 */

/** Which band an assembled section belongs to, for the annotated display. */
export type SystemPromptSectionBand =
  /** The fixed harness identity section (order -100). */
  | 'identity'
  /** The harness source-checkout line (order -99). */
  | 'source'
  /** The web-surface orientation section (order -98). */
  | 'web-surface'
  /** The deployment persona section (order 0). */
  | 'persona'
  /** The plan-mode policy section (order 50; state-driven). */
  | 'plan'
  /** The file-reference note (order 99). */
  | 'file-reference'
  /** The code-mode collapse rule (order 99; state/code-mode driven). */
  | 'code-only'
  /** Tool-guidance prose: this plugin's replacement or the per-tool sections. */
  | 'tool-guidance'
  /** The code SDK guidance (order 150; code-mode driven). */
  | 'sdk'
  /** The deliverables note (order 190). */
  | 'deliverables'
  /** This plugin's custom text section (configurable order, default 200). */
  | 'custom'
  /** Any other plugin's section. */
  | 'other'

/** Every band value, for boundary validators that must not import runtime logic. */
export const SECTION_BANDS: readonly SystemPromptSectionBand[] = [
  'identity', 'source', 'web-surface', 'persona', 'plan', 'file-reference',
  'code-only', 'tool-guidance', 'sdk', 'deliverables', 'custom', 'other',
]

/** Registry name of the fixed harness identity opener. */
export const IDENTITY_SECTION = 'harness:identity'
/** Registry name of the harness source-checkout line (added by app-boot). */
export const SOURCE_SECTION = 'harness:source'
/** Registry name of the web-surface orientation section (added by web-app). */
export const WEB_SURFACE_SECTION = 'app:web-surface'
/** Registry name of the deployment persona slot. */
export const PERSONA_SECTION = 'deployment:persona'
/** Newer dsh split the persona into a prefix; recognized for version drift. */
export const PERSONA_PREFIX_SECTION = 'deployment:persona-prefix'
/** Newer dsh split the persona into a suffix; recognized for version drift. */
export const PERSONA_SUFFIX_SECTION = 'deployment:persona-suffix'
/** Registry name of the plan-mode policy section (state-driven). */
export const PLAN_POLICY_SECTION = 'plan:policy'
/** Registry name of the file-reference note (per-agent, tool-gated). */
export const FILE_REFERENCE_SECTION = 'context:file-reference'
/** Registry name of the code-mode collapse rule (state/code-mode driven). */
export const CODE_ONLY_SECTION = 'tools:code-only'
/** Name of the single tool-guidance section this plugin inserts as a replacement. */
export const TOOL_GUIDANCE_SECTION = 'user:tool-guidance'
/** Registry-name convention of the per-tool guidance sections (orders 100-199). */
export const TOOL_SECTION_PREFIX = 'tool:'
/** Registry name of the code SDK guidance (state/code-mode driven). */
export const SDK_SECTION = 'tools:sdk'
/** Registry name of the deliverables note. */
export const DELIVERABLES_SECTION = 'ui:deliverable-file-references'
/** Registry name of this plugin's custom text section. */
export const CUSTOM_SECTION = 'user:system-prompt-editor'

/** Prompt order of the harness identity opener. */
export const IDENTITY_ORDER = -100
/** Prompt order of the harness source-checkout line. */
export const SOURCE_ORDER = -99
/** Prompt order of the web-surface orientation section. */
export const WEB_SURFACE_ORDER = -98
/** Prompt order of the persona slot; the first section a model reads. */
export const PERSONA_ORDER = 0
/** Prompt order of the plan-mode policy section. */
export const PLAN_POLICY_ORDER = 50
/** Prompt order of the file-reference note. */
export const FILE_REFERENCE_ORDER = 99
/** Prompt order of the code-mode collapse rule. */
export const CODE_ONLY_ORDER = 99
/** Display order of the tool-guidance replacement section (mid-band). */
export const TOOL_GUIDANCE_ORDER = 150
/** Prompt order of the code SDK guidance section. */
export const SDK_ORDER = 150
/** Prompt order of the deliverables note. */
export const DELIVERABLES_ORDER = 190
/** Default prompt order of this plugin's custom text section (configurable). */
export const CUSTOM_ORDER_DEFAULT = 200

/** Where one catalog entry's value is stored. */
export type SectionStorage =
  /** A top-level field of the settings namespace section. */
  | { readonly kind: 'field'; readonly field: 'text' | 'persona' | 'toolGuidance' }
  /** A key of the generic `sections` map, addressed by the section's registry name. */
  | { readonly kind: 'section'; readonly name: string }

/** One catalog entry: a section this plugin knows how to represent in the UI. */
export interface SectionCatalogEntry {
  /** Stable card key, e.g. `field:text` or `section:harness:identity`. */
  readonly key: string
  /** Where the edited value is persisted. */
  readonly storage: SectionStorage
  /** Registry name of the assembled section. */
  readonly name: string
  /** Canonical order, used for chips and for insertion of an absent section. */
  readonly order: number
  /** Card/row title. */
  readonly label: string
  /** One-line explanation under the editor. */
  readonly caption: string
  /** Band classification for the annotated display. */
  readonly band: SystemPromptSectionBand
  /** Whether this plugin offers a text editor for this section. */
  readonly editable: boolean
  /** Optional warning shown with an editable card (machine-critical sections). */
  readonly caution?: string
}

/** The curated, editable sections (Tier A), in render order. */
export const SECTION_CATALOG: readonly SectionCatalogEntry[] = [
  {
    key: `section:${IDENTITY_SECTION}`,
    storage: { kind: 'section', name: IDENTITY_SECTION },
    name: IDENTITY_SECTION,
    order: IDENTITY_ORDER,
    label: 'Harness identity',
    band: 'identity',
    editable: true,
    caption: 'Replaces the fixed identity opener; empty keeps it.',
    caution: 'The identity line orients the model to the harness. Replacing it removes that orientation for every session.',
  },
  {
    key: `section:${SOURCE_SECTION}`,
    storage: { kind: 'section', name: SOURCE_SECTION },
    name: SOURCE_SECTION,
    order: SOURCE_ORDER,
    label: 'Source checkout',
    band: 'source',
    editable: true,
    caption: 'Replaces the harness source-checkout line; empty keeps it.',
    caution: 'The source line names the implementation checkout the harness edits. Replacing it hides machine orientation.',
  },
  {
    key: `section:${WEB_SURFACE_SECTION}`,
    storage: { kind: 'section', name: WEB_SURFACE_SECTION },
    name: WEB_SURFACE_SECTION,
    order: WEB_SURFACE_ORDER,
    label: 'Web surface',
    band: 'web-surface',
    editable: true,
    caption: 'Replaces the web-surface orientation section; empty keeps it.',
    caution: 'This section tells the model it is talking through the web surface. Replacing it may confuse sessions about their surface.',
  },
  {
    key: 'field:persona',
    storage: { kind: 'field', field: 'persona' },
    name: PERSONA_SECTION,
    order: PERSONA_ORDER,
    label: 'Persona',
    band: 'persona',
    editable: true,
    caption: 'Overrides the deployment persona when non-empty; empty keeps the deployment default.',
  },
  {
    key: `section:${FILE_REFERENCE_SECTION}`,
    storage: { kind: 'section', name: FILE_REFERENCE_SECTION },
    name: FILE_REFERENCE_SECTION,
    order: FILE_REFERENCE_ORDER,
    label: 'File-reference note',
    band: 'file-reference',
    editable: true,
    caption: 'Replaces the note about mentioning created/modified files in the final response; empty keeps it.',
    caution: 'This note is what makes changed-file links clickable in Web output. It is registered per agent, so it is absent from the scope-less preview, but the override still replaces it in real sessions.',
  },
  {
    key: 'field:toolGuidance',
    storage: { kind: 'field', field: 'toolGuidance' },
    name: TOOL_GUIDANCE_SECTION,
    order: TOOL_GUIDANCE_ORDER,
    label: 'Tool guidance',
    band: 'tool-guidance',
    editable: true,
    caption: 'Replaces the per-tool guidance sections when non-empty; empty keeps the defaults.',
  },
  {
    key: `section:${DELIVERABLES_SECTION}`,
    storage: { kind: 'section', name: DELIVERABLES_SECTION },
    name: DELIVERABLES_SECTION,
    order: DELIVERABLES_ORDER,
    label: 'Deliverables note',
    band: 'deliverables',
    editable: true,
    caption: 'Replaces the response-format note about mentioning primary outputs; empty keeps it.',
  },
  {
    key: 'field:text',
    storage: { kind: 'field', field: 'text' },
    name: CUSTOM_SECTION,
    order: CUSTOM_ORDER_DEFAULT,
    label: 'Custom system prompt text',
    band: 'custom',
    editable: true,
    caption: 'Appended verbatim after the persona and tool guidance.',
  },
]

/** Sections owned by DSH state/code-mode plugins: shown read-only, never edited. */
export const MANAGED_SECTIONS: readonly SectionCatalogEntry[] = [
  {
    key: `section:${PLAN_POLICY_SECTION}`,
    storage: { kind: 'section', name: PLAN_POLICY_SECTION },
    name: PLAN_POLICY_SECTION,
    order: PLAN_POLICY_ORDER,
    label: 'Plan mode policy',
    band: 'plan',
    editable: false,
    caption: 'Rendered only while plan mode is active; managed by dsh-plan-mode.',
  },
  {
    key: `section:${CODE_ONLY_SECTION}`,
    storage: { kind: 'section', name: CODE_ONLY_SECTION },
    name: CODE_ONLY_SECTION,
    order: CODE_ONLY_ORDER,
    label: 'Code-mode rule',
    band: 'code-only',
    editable: false,
    caption: 'Rendered only in code-mode deployments; managed by dsh-tools.',
  },
  {
    key: `section:${SDK_SECTION}`,
    storage: { kind: 'section', name: SDK_SECTION },
    name: SDK_SECTION,
    order: SDK_ORDER,
    label: 'Code SDK guidance',
    band: 'sdk',
    editable: false,
    caption: 'Rendered only in code-mode deployments; managed by dsh-tools.',
  },
]

/** All catalog entries (editable then managed), in render order. */
export const ALL_SECTIONS: readonly SectionCatalogEntry[] = [...SECTION_CATALOG, ...MANAGED_SECTIONS]

/** Registry names this plugin shows read-only. */
export const MANAGED_SECTION_NAMES: ReadonlySet<string> = new Set(MANAGED_SECTIONS.map(entry => entry.name))

/**
 * Every registry name the curated catalog (editable cards) or the managed
 * list covers, field-backed entries included (`deployment:persona`, tool
 * guidance, custom text). Preview discovery must never re-offer these as
 * generic cards — that is what doubled the panel.
 */
export const CATALOG_SECTION_NAMES: ReadonlySet<string> = new Set(
  [...SECTION_CATALOG, ...MANAGED_SECTIONS].map(entry => entry.name),
)

/** The registry name of a section-storage entry, when it is one. */
function sectionStorageName(storage: SectionStorage): string | undefined {
  return storage.kind === 'section' ? storage.name : undefined
}

/** Registry names this plugin offers a text editor for (curated, editable). */
export const EDITABLE_SECTION_NAMES: ReadonlySet<string> = new Set(
  SECTION_CATALOG
    .filter(entry => entry.editable)
    .map(entry => sectionStorageName(entry.storage))
    .filter((name): name is string => name !== undefined),
)

/** Canonical order per registry name, for chips and insertion of absent sections. */
const ORDER_BY_NAME: Readonly<Record<string, number>> = {
  [IDENTITY_SECTION]: IDENTITY_ORDER,
  [SOURCE_SECTION]: SOURCE_ORDER,
  [WEB_SURFACE_SECTION]: WEB_SURFACE_ORDER,
  [PERSONA_SECTION]: PERSONA_ORDER,
  [PLAN_POLICY_SECTION]: PLAN_POLICY_ORDER,
  [FILE_REFERENCE_SECTION]: FILE_REFERENCE_ORDER,
  [CODE_ONLY_SECTION]: CODE_ONLY_ORDER,
  [TOOL_GUIDANCE_SECTION]: TOOL_GUIDANCE_ORDER,
  [SDK_SECTION]: SDK_ORDER,
  [DELIVERABLES_SECTION]: DELIVERABLES_ORDER,
  [CUSTOM_SECTION]: CUSTOM_ORDER_DEFAULT,
}

/**
 * Classify one assembled section into the band the UI annotates.
 * @param name - the section's registry name.
 * @returns the band.
 */
export function bandOfSection(name: string): SystemPromptSectionBand {
  if (name === IDENTITY_SECTION) return 'identity'
  if (name === SOURCE_SECTION) return 'source'
  if (name === WEB_SURFACE_SECTION) return 'web-surface'
  if (name === PERSONA_SECTION || name === PERSONA_PREFIX_SECTION || name === PERSONA_SUFFIX_SECTION) return 'persona'
  if (name === PLAN_POLICY_SECTION) return 'plan'
  if (name === FILE_REFERENCE_SECTION) return 'file-reference'
  if (name === CODE_ONLY_SECTION) return 'code-only'
  if (name === TOOL_GUIDANCE_SECTION || name.startsWith(TOOL_SECTION_PREFIX)) return 'tool-guidance'
  if (name === SDK_SECTION) return 'sdk'
  if (name === DELIVERABLES_SECTION) return 'deliverables'
  if (name === CUSTOM_SECTION) return 'custom'
  return 'other'
}

/**
 * The canonical order of one known section, when this plugin knows it.
 * Per-tool guidance sections report the replacement band's order (150);
 * unknown sections report none.
 * @param name - the section's registry name.
 * @returns the canonical order, or `undefined`.
 */
export function knownSectionOrder(name: string): number | undefined {
  const order = ORDER_BY_NAME[name]
  if (order !== undefined) return order
  if (name === TOOL_GUIDANCE_SECTION || name.startsWith(TOOL_SECTION_PREFIX)) return TOOL_GUIDANCE_ORDER
  return undefined
}

/** Whether a section is in the plugin's read-only managed set. */
export function isManagedSection(name: string): boolean {
  return MANAGED_SECTION_NAMES.has(name)
}

/** Whether a section has a curated editable editor card. */
export function isEditableSection(name: string): boolean {
  return EDITABLE_SECTION_NAMES.has(name)
}
