/**
 * The System Prompt Editor settings page. A profile toolbar sits at the top of
 * the page, above every editor card: pick a saved profile, save, load, or
 * clear the whole editable prompt in one gesture. Below it sits one editor card
 * per curated, editable section (Tier A — identity, source, web surface,
 * persona, file-reference, tool guidance, deliverables, custom), plus cards for
 * third-party sections discovered through the last preview (Tier B).
 *
 * The toolbar and the cards address two different places, and the labels say
 * which: a profile holds the saved prompt library, while the editor boxes hold
 * the live prompt the next assembly reads.
 *
 * - Save all writes every box into the selected profile. It does not change
 *   what the model reads.
 * - Load all applies the selected profile to the live prompt: it writes the
 *   stored overrides and fills every box, so the change lands on the next
 *   message with no extra click.
 * - Clear all unsets every live override, leaving the shipping deployment
 *   prompt in force. Saved profiles survive it.
 *
 * Cards collapse individually, with one master toggle for all of them. A
 * collapsed card keeps its title, order chip, and an Unsaved badge, so a hidden
 * draft can never hide silently.
 *
 * Everything arrives through the props shares (AGENTS.md): the bound scope
 * snapshot through the injected `useSystemPromptSettings` selector hook, host
 * writes through the injected callbacks, and host-side assembly through the
 * injected `preview` callback. The component never sees ctx nor the scope
 * source itself.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import {
  SECTION_CATALOG, MANAGED_SECTION_NAMES, CATALOG_SECTION_NAMES, TOOL_SECTION_PREFIX,
  PERSONA_SECTION, TOOL_GUIDANCE_SECTION,
} from '../shared/catalog.ts'
import { DEFAULT_PROFILE_NAME } from '../shared/section.ts'
import type { SystemPromptProfile } from '../shared/section.ts'
import type {
  SystemPromptDrafts, SystemPromptPreviewResult, SystemPromptPreviewScope, SystemPromptSectionBand,
} from '../shared/remote.ts'

/** The settings section this plugin stores: three free-text fields plus a generic section map. */
export interface SystemPromptSettingsSection {
  text?: string
  persona?: string
  toolGuidance?: string
  /** Per-section overrides keyed by registry name. */
  sections?: Record<string, string>
  /** Saved system-prompt profiles: one complete editable snapshot per name. */
  profiles?: Record<string, SystemPromptProfile | undefined>
}

/** Where one Save lands: a top-level field or one key of the generic section map. */
export type SystemPromptSaveTarget =
  | { readonly kind: 'field'; readonly field: 'text' | 'persona' | 'toolGuidance' }
  | { readonly kind: 'section'; readonly name: string }

/**
 * A profile entry, selected for loading rather than for writing. The panel
 * needs it because the built-in `Default` profile is synthesized when the
 * settings document has none, so it has no stored counterpart to write to.
 */
export interface SystemPromptProfileTarget {
  readonly kind: 'profile'
  readonly name: string
}

/** One full editable prompt, as the panel's boxes hold it. */
export interface SystemPromptValues {
  readonly text: string
  readonly persona: string
  readonly toolGuidance: string
  readonly sections: Readonly<Record<string, string>>
}

/** What a profile action attempt settled as. */
export type SystemPromptEditorProfileOutcome =
  | { readonly status: 'saved'; readonly name: string; readonly created: boolean }
  | { readonly status: 'applied'; readonly name: string; readonly values: SystemPromptValues }
  | { readonly status: 'cleared' }
  | { readonly status: 'not-applied'; readonly message: string }
  | { readonly status: 'error'; readonly message: string }

/** What a Save attempt settled as, decided by the Host read-back. */
export type SystemPromptEditorSaveOutcome =
  | { status: 'saved' }
  /** The write settled but the section does not hold the draft (host-side refusal / conflict). */
  | { status: 'not-applied' }
  /** The write path itself failed. */
  | { status: 'error'; message: string }

/** What a Preview attempt settled as. */
export type SystemPromptEditorPreviewOutcome =
  | { status: 'previewed'; result: SystemPromptPreviewResult }
  | { status: 'error'; message: string }

/** The registration-side face the settings.section entry injects. */
export interface SystemPromptEditorInjected {
  hooks: {
    /** Bound settings scope for the namespace; renderer binds it as useSystemPromptSettings. */
    systemPromptSettings: SettingsScope<SystemPromptSettingsSection>
  }
  /** Write one field's draft into the namespace and verify it landed. */
  save: (target: SystemPromptSaveTarget, value: string) => Promise<SystemPromptEditorSaveOutcome>
  /** Assemble the full prompt host-side with all drafts applied. */
  preview: (drafts: SystemPromptDrafts) => Promise<SystemPromptEditorPreviewOutcome>
  /** Write every editable value to the live prompt in one gesture. */
  applyAll: (values: SystemPromptDrafts) => Promise<SystemPromptEditorSaveOutcome>
  /** Persist a whole editable prompt under a profile name, replacing that name. */
  saveProfile: (name: string, profile: SystemPromptProfile) => Promise<SystemPromptEditorSaveOutcome>
  /** Remove one saved profile. */
  deleteProfile: (name: string) => Promise<SystemPromptEditorSaveOutcome>
  /** Unset every live override so the deployment defaults come back. */
  clearAll: () => Promise<SystemPromptEditorSaveOutcome>
}

/** Full component props: section owner share + inject face. */
export type SystemPromptEditorPanelProps =
  PropsRuntime<'settings.section'> & InjectFace<SystemPromptEditorInjected>

const MONOSPACE = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'

/** One editor card's definition, derived from the shared catalog or a discovered section. */
interface EditorCard {
  /** Stable card key in the local cards map (curated entry key or `discovered:<name>`). */
  readonly key: string
  /** Where Save writes. */
  readonly target: SystemPromptSaveTarget
  readonly label: string
  readonly orderLabel: string
  readonly hint: string
  readonly caution?: string
}

/** The profile the toolbar has selected, or a request to name a new one. */
const NEW_PROFILE = '\u0000new'

/** Display label for the tool-guidance band (a range, not one order). */
const TOOL_BAND_ORDER_LABEL = 'orders 100–199'

/** The profile name that can never be removed: the baseline a reset lands on. */
const RESERVED_PROFILE = DEFAULT_PROFILE_NAME

function curatedCards(): EditorCard[] {
  return SECTION_CATALOG.filter(entry => entry.editable).map(entry => ({
    key: entry.key,
    target: entry.storage.kind === 'field'
      ? { kind: 'field', field: entry.storage.field }
      : { kind: 'section', name: entry.storage.name },
    label: entry.label,
    orderLabel: entry.band === 'tool-guidance' ? TOOL_BAND_ORDER_LABEL : `order ${entry.order}`,
    hint: entry.caption,
    ...(entry.caution === undefined ? {} : { caution: entry.caution }),
  }))
}

function discoveredCards(sections: readonly { name: string; order?: number }[]): EditorCard[] {
  return sections
    // Discovery is only for sections the curated catalog and managed list do
    // NOT already cover — otherwise Preview re-adds cards the panel already
    // renders (identity, source, persona, custom, …). Per-tool guidance is
    // covered by the tool-guidance band card and stays a Tier C follow-up.
    .filter(section => !CATALOG_SECTION_NAMES.has(section.name) && !section.name.startsWith(TOOL_SECTION_PREFIX))
    .map(section => ({
      key: `discovered:${section.name}`,
      target: { kind: 'section', name: section.name } satisfies SystemPromptSaveTarget,
      label: section.name,
      orderLabel: section.order === undefined ? 'order unknown' : `order ${section.order}`,
      hint: 'Any non-empty text replaces this section for every session; empty keeps it. This section was seen in a preview, not a curated catalog entry.',
    }))
}

/**
 * Cards for section keys a loaded profile carries that the page has no card
 * for yet. Without this, loading a profile whose third-party sections were
 * never discovered on this visit would restore them to storage but leave them
 * invisible, so the next Save all would quietly drop them.
 */
function profileOnlyCards(profile: SystemPromptProfile, known: ReadonlySet<string>): EditorCard[] {
  return Object.entries(profile.sections ?? {})
    .filter(([name, text]) => text !== '' && !known.has(name) && !CATALOG_SECTION_NAMES.has(name))
    .map(([name]) => ({
      key: `discovered:${name}`,
      target: { kind: 'section', name } satisfies SystemPromptSaveTarget,
      label: name,
      orderLabel: 'order unknown',
      hint: 'Restored from the loaded profile. This section was not part of the last preview, so its live text is unknown.',
    }))
}

/** Assembling with empty drafts returns the CURRENT effective prompt (stored overrides applied). */
const EMPTY_DRAFTS: SystemPromptDrafts = { text: '', persona: '', toolGuidance: '', sections: {} }

/**
 * The effective text of one card target from a fresh assembly: the stored
 * override when one exists, otherwise the default the assembly carried. Field
 * targets map to their registry section; the tool band joins the per-tool
 * guidance sections when no replacement is stored. Returns undefined when the
 * assembly has no text for the target (custom section by default, and any
 * section the assembled composition does not contribute at all).
 */
function effectiveText(result: SystemPromptPreviewResult, target: SystemPromptSaveTarget): string | undefined {
  if (target.kind === 'section') {
    return result.sections.find(section => section.name === target.name)?.text
  }
  if (target.field === 'persona') {
    return result.sections.find(section => section.name === PERSONA_SECTION)?.text
  }
  if (target.field === 'toolGuidance') {
    const replacement = result.sections.find(section => section.name === TOOL_GUIDANCE_SECTION)
    if (replacement !== undefined) return replacement.text
    const band = result.sections.filter(section => section.band === 'tool-guidance')
    if (band.length > 0) return band.map(section => section.text).filter(text => text !== '').join('\n\n')
  }
  return undefined
}

/** The stored text of one target, from the bound scope snapshot. */
function storedTextOf(section: SystemPromptSettingsSection | undefined, target: SystemPromptSaveTarget): string {
  if (section === undefined) return ''
  if (target.kind === 'field') return section[target.field] ?? ''
  return section.sections?.[target.name] ?? ''
}

/**
 * What a preview assembled under, as one sentence: the preset composition that
 * answered, or why the host could not reach one. A scope-less preview reports a
 * prompt no session reads — the model-facing rows belong to a preset — so the
 * page says so instead of presenting the result as the live prompt.
 * @param scope - the scope report from the preview result.
 * @returns the sentence, or null when the preview reported no scope at all.
 */
function scopeNotice(scope: SystemPromptPreviewScope | undefined): string | null {
  if (scope === undefined) return null
  if (scope.presetId !== undefined) {
    return `Assembled under the "${scope.presetId}" preset — the composition a new session composes by default. A session using another preset may differ.`
  }
  if (scope.fallback === 'no-roster') {
    return 'This deployment mounts no preset roster, so the preview assembled globally: every model-facing row sits in the global layer there.'
  }
  return `The default preset could not be composed, so the preview assembled globally and omits every model-facing row a preset owns${scope.reason === undefined ? '' : ` (${scope.reason})`}.`
}

/** Read one profile out of the snapshot, filling the absent fields with empty text. */
function profileValues(profile: SystemPromptProfile | undefined): SystemPromptValues | undefined {
  if (profile === undefined) return undefined
  return {
    text: profile.text ?? '',
    persona: profile.persona ?? '',
    toolGuidance: profile.toolGuidance ?? '',
    sections: profile.sections ?? {},
  }
}

/** The built-in baseline: every component empty, so it means "the deployment default". */
const EMPTY_PROFILE: SystemPromptProfile = { text: '', persona: '', toolGuidance: '', sections: {} }

/** A short, readable "saved <when>" label for a profile entry. */
function savedAtLabel(savedAt: string | undefined): string {
  if (savedAt === undefined) return 'saved earlier, before timestamps'
  const parsed = new Date(savedAt)
  if (Number.isNaN(parsed.getTime())) return 'saved earlier, before timestamps'
  return `saved ${parsed.toLocaleString()}`
}

const BAND_LABELS: Record<SystemPromptSectionBand, string> = {
  identity: 'Harness identity',
  source: 'Source checkout',
  'web-surface': 'Web surface',
  persona: 'Persona',
  plan: 'Plan mode policy',
  'file-reference': 'File reference',
  'code-only': 'Code-mode rule',
  'tool-guidance': 'Tool guidance',
  sdk: 'Code SDK guidance',
  deliverables: 'Deliverables note',
  custom: 'Custom text',
  other: 'Other section',
}

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '16px 20px',
    maxWidth: '760px',
  } as const,
  title: {
    margin: 0,
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--dsw-alias-label-primary)',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px 14px',
    background: 'var(--dsw-alias-bg-layer-0)',
    border: '1px solid var(--dsw-alias-border-l1)',
    borderRadius: '10px',
  } as const,
  editor: {
    width: '100%',
    minHeight: '120px',
    padding: '10px 12px',
    fontSize: '13px',
    lineHeight: '1.5',
    fontFamily: MONOSPACE,
    color: 'var(--dsw-alias-label-primary)',
    background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
    borderRadius: '8px',
    resize: 'vertical',
    boxSizing: 'border-box',
  } as const,
  hint: {
    margin: 0,
    fontSize: '12px',
    color: 'var(--dsw-alias-label-tertiary)',
  },
  notice: {
    margin: 0,
    fontSize: '12px',
    color: 'var(--dsw-alias-brand-text)',
  },
  caution: {
    margin: 0,
    fontSize: '12px',
    color: 'var(--dsw-alias-state-warn-primary)',
  },
  error: {
    margin: 0,
    fontSize: '12px',
    color: 'var(--dsw-alias-interactive-bg-hover-danger)',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
  },
  button: {
    padding: '6px 14px',
    fontSize: '13px',
    borderRadius: '6px',
    border: '1px solid var(--dsw-alias-border-l2)',
    background: 'var(--dsw-alias-bg-layer-2)',
    color: 'var(--dsw-alias-label-primary)',
    cursor: 'pointer',
  },
  primaryButton: {
    padding: '6px 14px',
    fontSize: '13px',
    borderRadius: '6px',
    border: 'none',
    background: 'var(--dsw-alias-button-primary-fill)',
    // Host pairing: primary fill + label-primary-foreground (white in light
    // theme, near-black in dark). `--dsw-alias-button-contrast-fill` is a
    // surface fill, not a text color — using it here rendered the label
    // invisible in light mode.
    color: 'var(--dsw-alias-label-primary-foreground)',
    cursor: 'pointer',
  },
  disabledButton: {
    opacity: 0.4,
    cursor: 'not-allowed',
  } as const,
  status: {
    margin: 0,
    fontSize: '12px',
    color: 'var(--dsw-alias-label-secondary)',
  },
  caption: {
    margin: 0,
    fontSize: '12px',
    lineHeight: '1.5',
    color: 'var(--dsw-alias-label-tertiary)',
  },
  badge: {
    marginLeft: '8px',
    padding: '2px 8px',
    fontSize: '11px',
    fontWeight: 600,
    borderRadius: '999px',
    color: 'var(--dsw-alias-label-tertiary)',
    border: '1px solid var(--dsw-alias-border-l2)',
  } as const,
  profileBadge: {
    marginLeft: '8px',
    padding: '2px 8px',
    fontSize: '11px',
    fontWeight: 600,
    borderRadius: '999px',
    color: 'var(--dsw-alias-brand-text)',
    border: '1px solid var(--dsw-alias-brand-text)',
  } as const,
  managedBadge: {
    marginLeft: '8px',
    padding: '2px 8px',
    fontSize: '11px',
    fontWeight: 600,
    borderRadius: '999px',
    color: 'var(--dsw-alias-state-warn-primary)',
    border: '1px solid var(--dsw-alias-state-warn-secondary)',
  } as const,
  heading: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as const,
  orderChip: {
    padding: '1px 8px',
    fontSize: '11px',
    fontWeight: 500,
    borderRadius: '999px',
    color: 'var(--dsw-alias-label-tertiary)',
    background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l2)',
    whiteSpace: 'nowrap' as const,
  },
  previewHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as const,
  sectionBlock: {
    margin: 0,
    padding: '10px 12px',
    fontSize: '12.5px',
    lineHeight: '1.55',
    fontFamily: MONOSPACE,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    color: 'var(--dsw-alias-label-primary)',
    background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
    borderRadius: '8px',
  } as const,
  sectionLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    margin: '10px 0 4px',
  } as const,
  /** The toolbar card: visually distinct from the editor cards it governs. */
  profileBar: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '12px 14px',
    background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: '10px',
  } as const,
  profileRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
  } as const,
  select: {
    minWidth: '200px',
    padding: '6px 10px',
    fontSize: '13px',
    borderRadius: '6px',
    border: '1px solid var(--dsw-alias-border-l2)',
    background: 'var(--dsw-alias-bg-layer-2)',
    color: 'var(--dsw-alias-label-primary)',
  } as const,
  input: {
    minWidth: '180px',
    padding: '6px 10px',
    fontSize: '13px',
    borderRadius: '6px',
    border: '1px solid var(--dsw-alias-border-l2)',
    background: 'var(--dsw-alias-bg-layer-2)',
    color: 'var(--dsw-alias-label-primary)',
  } as const,
  profileLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--dsw-alias-label-secondary)',
  } as const,
  cardHeaderButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
    padding: 0,
    border: 'none',
    background: 'transparent',
    textAlign: 'left' as const,
    cursor: 'pointer',
  } as const,
  caret: {
    fontSize: '11px',
    color: 'var(--dsw-alias-label-tertiary)',
    width: '10px',
  } as const,
}

/** One card's per-field UI state. */
interface CardState {
  readonly draft: string
  /** The stored text when the user first edited; null while untouched. */
  readonly editStartedFrom: string | null
  readonly outcome: SystemPromptEditorSaveOutcome | null
  readonly loadNote: string | null
}

const INITIAL_STATE: CardState = {
  draft: '',
  editStartedFrom: null,
  outcome: null,
  loadNote: null,
}

const PREVIEW_STATE = {
  open: false,
  loading: false,
  error: null as string | null,
  result: null as SystemPromptPreviewResult | null,
}

/** Build the initial card-state map for the curated cards. */
function initialCards(): Record<string, CardState> {
  const out: Record<string, CardState> = {}
  for (const card of curatedCards()) out[card.key] = INITIAL_STATE
  return out
}

/**
 * Render the System Prompt settings page.
 * @param props - section owner share plus the injected scope face.
 * @returns the page.
 */
export function SystemPromptEditorPanel(props: SystemPromptEditorPanelProps) {
  const snapshot = props.useSystemPromptSettings(s => s)
  const ready = snapshot.status === 'ready'
  const writable = snapshot.writable
  const section = snapshot.value
  // The latest stored section, readable straight after an awaited write. The
  // render-scoped `section` above is the value of the render that created the
  // handler, and the scope publishes a new snapshot a render or two after a
  // write settles — reading through this ref is what keeps a profile load from
  // comparing fresh drafts against the pre-write store.
  const sectionRef = useRef(section)
  sectionRef.current = section
  const stored = (target: SystemPromptSaveTarget): string => storedTextOf(section, target)

  const savedProfiles = useMemo(
    () => section?.profiles ?? ({} as Record<string, SystemPromptProfile | undefined>),
    [section?.profiles],
  )
  const profileNames = useMemo(() => Object.keys(savedProfiles).sort((a, b) => a.localeCompare(b)), [savedProfiles])
  /** `Default` always exists, even in a document that has never saved a profile. */
  const profileEntry = (name: string): SystemPromptProfile | undefined =>
    name === RESERVED_PROFILE ? (savedProfiles[name] ?? EMPTY_PROFILE) : savedProfiles[name]

  // Curated cards are static; discovered cards extend after a preview or a profile load.
  const curated = useMemo(curatedCards, [])
  const [discovered, setDiscovered] = useState<EditorCard[]>([])

  const [drafts, setDrafts] = useState<Record<string, CardState>>(initialCards)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set<string>())
  const [savingCard, setSavingCard] = useState<string | null>(null)
  const [loadingCard, setLoadingCard] = useState<string | null>(null)
  const [preview, setPreview] = useState(PREVIEW_STATE)
  const [selection, setSelection] = useState<string>(RESERVED_PROFILE)
  const [newName, setNewName] = useState('')
  const [profileBusy, setProfileBusy] = useState<string | null>(null)
  const [profileNotice, setProfileNotice] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileWarning, setProfileWarning] = useState<string | null>(null)
  /** Bumped after a Clear all so untouched cards re-read the file-resolved text. */
  const [revision, setRevision] = useState(0)

  const allCards = useMemo(() => [...curated, ...discovered], [curated, discovered])
  const cardByKey = useMemo(() => {
    const map = new Map<string, EditorCard>()
    for (const card of allCards) map.set(card.key, card)
    return map
  }, [allCards])

  const creating = selection === NEW_PROFILE
  const selectedName = creating ? '' : selection

  // Adopt external changes while a card's draft is untouched; keep the draft
  // once edited (the hint renders from editStartedFrom instead). `revision`
  // re-runs this after an action that changed storage without touching every
  // stored value, which is the case for Clear all.
  useEffect(() => {
    setDrafts(current => {
      let next = current
      for (const card of allCards) {
        const state = current[card.key]
        if (state === undefined || state.editStartedFrom !== null) continue
        const adopted = stored(card.target)
        if (state.draft === adopted) continue
        next = next === current ? { ...current } : next
        next[card.key] = { ...state, draft: adopted }
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, allCards, revision])

  /**
   * Build one card's state after an action filled it from storage: the draft is
   * what storage holds, so the card counts as UNEDITED when the two agree.
   * Marking it edited is what stops the external-adoption effect from
   * overwriting the draft with a value it read from a stale snapshot — the
   * effect skips any card carrying an `editStartedFrom`.
   * @param target - the card's save target.
   * @param draft - the text the action put in the box.
   * @returns the card's next state.
   */
  const adoptedState = (target: SystemPromptSaveTarget, draft: string): CardState => {
    const stored = storedTextOf(sectionRef.current, target)
    return {
      draft,
      editStartedFrom: draft === stored ? null : stored,
      outcome: null,
      loadNote: null,
    }
  }

  const handleEdit = (key: string, text: string) => {
    setDrafts(current => ({
      ...current,
      [key]: {
        draft: text,
        editStartedFrom: current[key]?.editStartedFrom ?? stored(cardByKey.get(key)!.target),
        outcome: null,
        loadNote: null,
      },
    }))
  }

  const handleSave = async (key: string) => {
    const card = cardByKey.get(key)
    if (card === undefined) return
    const value = drafts[key]?.draft ?? ''
    setSavingCard(key)
    setDrafts(current => ({ ...current, [key]: { ...current[key]!, outcome: null } }))
    try {
      const result = await props.save(card.target, value)
      setDrafts(current => ({
        ...current,
        [key]: {
          ...current[key]!,
          outcome: result,
          editStartedFrom: result.status === 'saved' ? null : current[key]!.editStartedFrom,
        },
      }))
    } finally {
      setSavingCard(null)
    }
  }

  /** The full editable prompt as the boxes hold it right now. */
  const valuesFromDrafts = (cards: readonly EditorCard[]): SystemPromptValues => {
    const sections: Record<string, string> = {}
    for (const card of cards) {
      if (card.target.kind !== 'section') continue
      const value = drafts[card.key]?.draft ?? ''
      if (value !== '') sections[card.target.name] = value
    }
    return {
      text: drafts['field:text']?.draft ?? '',
      persona: drafts['field:persona']?.draft ?? '',
      toolGuidance: drafts['field:toolGuidance']?.draft ?? '',
      sections,
    }
  }

  const handleLoad = async (key: string) => {
    const card = cardByKey.get(key)
    if (card === undefined || loadingCard !== null) return
    const storedValue = stored(card.target)
    setLoadingCard(key)
    try {
      // Load the CURRENT effective text: a fresh assembly with empty drafts
      // returns the stored override when one exists, otherwise the deployed
      // default — so the textarea holds what the model actually reads today,
      // ready to edit and save.
      let picked: string | undefined
      let loadNote: string | null = null
      const outcome = await props.preview(EMPTY_DRAFTS)
      if (outcome.status === 'previewed') {
        picked = effectiveText(outcome.result, card.target)
      }
      const draft = picked ?? storedValue
      if (outcome.status === 'error') {
        loadNote = `Could not assemble the current prompt: ${outcome.message}`
      } else if (card.target.kind === 'field' && card.target.field === 'text' && storedValue === '') {
        loadNote = 'This section is empty by default — there is no deployment text to load. Use Preview to see the full prompt.'
      } else if (picked !== undefined && picked !== '' && storedValue === '') {
        loadNote = 'No stored value — loaded the current default section text. Saving stores it as a fixed override.'
      } else if (picked === undefined && storedValue === '' && card.target.kind === 'field' && card.target.field === 'toolGuidance') {
        loadNote = 'No stored value, and the preview reported no tool-guidance sections — the composed preset contributes none. '
          + 'Preview shows the full prompt it assembled.'
      } else if (picked === undefined && storedValue === '') {
        loadNote = 'Nothing to load — no stored value, and this preview has no text for the section (the composed preset may not contribute it). '
          + 'Use Preview to see the full prompt.'
      }
      setDrafts(current => ({
        ...current,
        [key]: {
          ...current[key]!,
          draft,
          // A loaded draft that differs from what is stored counts as edited
          // so the external-adoption effect does not revert it.
          editStartedFrom: draft === storedValue ? null : storedValue,
          outcome: null,
          loadNote,
        },
      }))
    } finally {
      setLoadingCard(null)
    }
  }

  /** The current boxes as wire drafts (the same shape Preview sends). */
  const valuesFromDraftsAsDrafts = (): SystemPromptDrafts => {
    const values = valuesFromDrafts(allCards)
    return { text: values.text, persona: values.persona, toolGuidance: values.toolGuidance, sections: values.sections }
  }

  const handlePreview = async () => {
    setPreview(current => ({ ...current, open: true, loading: true, error: null }))
    const outcome = await props.preview(valuesFromDraftsAsDrafts())
    if (outcome.status === 'previewed') {
      setPreview(current => ({ ...current, loading: false, error: null, result: outcome.result }))
      // Discover third-party sections (Tier B) from the assembled prompt so
      // they become editable without a plugin update.
      setDiscovered(current => mergeCards(current, discoveredCards(outcome.result.sections)))
    } else {
      setPreview(current => ({ ...current, loading: false, error: outcome.message, result: null }))
    }
  }

  const handleSaveAll = async () => {
    const name = creating ? newName.trim() : selectedName
    setProfileError(null)
    setProfileNotice(null)
    setProfileWarning(null)
    if (name === '') {
      setProfileError('Type a name for the new profile first.')
      return
    }
    const exists = Object.hasOwn(savedProfiles, name)
    if (exists && !window.confirm(`Overwrite the saved profile "${name}" with the current editor contents?`)) return
    setProfileBusy('save')
    try {
      const values = valuesFromDrafts(allCards)
      const outcome = await props.saveProfile(name, {
        text: values.text,
        persona: values.persona,
        toolGuidance: values.toolGuidance,
        sections: values.sections,
      })
      if (outcome.status === 'error') {
        setProfileError(`Save all failed: ${outcome.message}`)
      } else if (outcome.status === 'not-applied') {
        setProfileError(`Save all did not take effect, so the profile "${name}" may not hold what you see. Reload the page to re-read the stored profiles.`)
      } else {
        setSelection(name)
        setNewName('')
        setProfileNotice(exists
          ? `Saved the editor contents into the profile "${name}". The live prompt is unchanged — use Load all to apply it.`
          : `Created the profile "${name}" from the editor contents. The live prompt is unchanged — use Load all to apply it.`)
      }
    } finally {
      setProfileBusy(null)
    }
  }

  const handleLoadAll = async () => {
    const profile = profileEntry(selectedName)
    setProfileError(null)
    setProfileNotice(null)
    setProfileWarning(null)
    if (profile === undefined) {
      setProfileError('Pick a profile to load.')
      return
    }
    setProfileBusy('load')
    try {
      const values = profileValues(profile)!
      const outcome = await props.applyAll({
        text: values.text,
        persona: values.persona,
        toolGuidance: values.toolGuidance,
        sections: values.sections,
      })
      if (outcome.status === 'error') {
        setProfileError(`Load all failed: ${outcome.message}`)
        return
      }
      if (outcome.status === 'not-applied') {
        setProfileError(`Load all did not take effect — the stored prompt may have changed underneath. Use Preview to see what the model actually reads.`)
        return
      }
      // Fill every box from the profile, and add cards for any section the
      // profile carries that this page has never discovered.
      const filled: Record<string, CardState> = {}
      for (const card of allCards) {
        const value = card.target.kind === 'field'
          ? values[card.target.field]
          : (values.sections[card.target.name] ?? '')
        filled[card.key] = adoptedState(card.target, value)
      }
      setDrafts(current => ({ ...current, ...filled }))
      const known = new Set(allCards.map(card => card.target.kind === 'section' ? card.target.name : ''))
      setDiscovered(current => mergeCards(current, profileOnlyCards(profile, known)))
      setRevision(revision_ => revision_ + 1)
      const pending = Object.keys(values.sections).filter(name =>
        !CATALOG_SECTION_NAMES.has(name) && !allCards.some(card => card.target.kind === 'section' && card.target.name === name))
      setProfileNotice(`Loaded the profile "${selectedName}" into the live prompt and every editor box. It takes effect on the next message.`)
      if (pending.length > 0) {
        setProfileWarning(`This profile also set ${pending.length} section${pending.length === 1 ? '' : 's'} that the last preview never reported (${pending.join(', ')}). They are applied, and their cards appear below.`)
      }
      if (preview.open) void handlePreview()
    } finally {
      setProfileBusy(null)
    }
  }

  const handleClearAll = async () => {
    setProfileError(null)
    setProfileNotice(null)
    setProfileWarning(null)
    setProfileBusy('clear')
    try {
      const outcome = await props.clearAll()
      if (outcome.status === 'error') {
        setProfileError(`Clear all failed: ${outcome.message}`)
        return
      }
      if (outcome.status === 'not-applied') {
        setProfileError('Clear all did not take effect — some stored values are still present. Reload the page to re-read them.')
        return
      }
      // Every override is gone, so the boxes must show what the deployment
      // default actually says. The adoption effect does that for any card
      // whose stored text changed; `revision` covers the rest.
      setRevision(value => value + 1)
      // The scope snapshot the clear verified against is already published:
      // `clearAll` only reports success after reading the cleared values back
      // out of it, so a rendition is safe to take right now.
      const rendition = await renderLivePrompt()
      if (rendition === null) {
        setProfileNotice('Cleared every override. The deployment default prompt is in force, and the boxes will fill with it on the next settings refresh.')
      } else {
        const filled: Record<string, CardState> = {}
        for (const card of allCards) {
          const target = card.target
          const value = target.kind === 'field' ? rendition.fields[target.field] : rendition.sections[target.name]
          filled[card.key] = adoptedState(target, value ?? '')
        }
        setDrafts(current => ({ ...current, ...filled }))
        setProfileNotice('Cleared every override. The boxes now hold the deployment default prompt, and the model reads it on the next message. Saved profiles are untouched.')
      }
      if (preview.open) void handlePreview()
    } finally {
      setProfileBusy(null)
    }
  }

  /**
   * Assemble the prompt that the LIVE stored overrides produce, and read each
   * card's effective text out of it. Every box then shows what the model would
   * read if it ran right now, which is what both Clear all and Reload want.
   * Returns null when the assembly cannot run, so the caller reports that
   * instead of blanking every box.
   * @returns per-card effective text, or null on a failed assembly.
   */
  const renderLivePrompt = async (): Promise<{ fields: Record<'text' | 'persona' | 'toolGuidance', string>; sections: Record<string, string> } | null> => {
    const outcome = await props.preview(EMPTY_DRAFTS)
    if (outcome.status !== 'previewed') return null
    const fields = { text: '', persona: '', toolGuidance: '' }
    const sections: Record<string, string> = {}
    for (const card of allCards) {
      const picked = effectiveText(outcome.result, card.target)
      if (picked === undefined) continue
      if (card.target.kind === 'field') fields[card.target.field] = picked
      else sections[card.target.name] = picked
    }
    return { fields, sections }
  }

  const handleReload = async () => {
    setProfileError(null)
    setProfileNotice(null)
    setProfileWarning(null)
    setProfileBusy('reload')
    try {
      const live = await renderLivePrompt()
      if (live === null) {
        setProfileError('Could not assemble the current prompt, so nothing was reloaded.')
        return
      }
      setRevision(value => value + 1)
      const filled: Record<string, CardState> = {}
      for (const card of allCards) {
        const target = card.target
        const value = target.kind === 'field' ? live.fields[target.field] : live.sections[target.name]
        if (value === undefined) continue
        filled[card.key] = adoptedState(target, value)
      }
      setDrafts(current => ({ ...current, ...filled }))
      setProfileNotice('Reloaded every box from the live prompt.')
      if (preview.open) void handlePreview()
    } finally {
      setProfileBusy(null)
    }
  }

  const handleNewProfile = () => {
    setSelection(NEW_PROFILE)
    setNewName('')
    setProfileNotice(null)
    setProfileError(null)
    setProfileWarning(null)
  }

  const handleDeleteProfile = async () => {
    if (creating) return
    setProfileError(null)
    setProfileNotice(null)
    setProfileWarning(null)
    if (selectedName === RESERVED_PROFILE) {
      setProfileError(`The "${RESERVED_PROFILE}" profile is the baseline a reset lands on, so it cannot be deleted. Overwrite it instead.`)
      return
    }
    if (!window.confirm(`Delete the saved profile "${selectedName}"? The live prompt is not affected.`)) return
    setProfileBusy('delete')
    try {
      const outcome = await props.deleteProfile(selectedName)
      if (outcome.status === 'error') {
        setProfileError(`Delete failed: ${outcome.message}`)
      } else if (outcome.status === 'not-applied') {
        setProfileError(`Delete did not take effect — "${selectedName}" is still stored.`)
      } else {
        setProfileNotice(`Deleted the saved profile "${selectedName}". The live prompt is unaffected.`)
        setSelection(RESERVED_PROFILE)
      }
    } finally {
      setProfileBusy(null)
    }
  }

  const handleResetToDefaultProfile = async () => {
    const profile = profileEntry(RESERVED_PROFILE)
    if (profile === undefined) return
    if (profileValues(profile) === undefined) return
    setSelection(RESERVED_PROFILE)
    setProfileNotice(null)
    setProfileError(null)
    setProfileWarning(null)
    setProfileBusy('load')
    try {
      const values = profileValues(profile)!
      const outcome = await props.applyAll({
        text: values.text,
        persona: values.persona,
        toolGuidance: values.toolGuidance,
        sections: values.sections,
      })
      if (outcome.status === 'saved') {
        const filled: Record<string, CardState> = {}
        for (const card of allCards) {
          const value = card.target.kind === 'field'
            ? values[card.target.field]
            : (values.sections[card.target.name] ?? '')
          filled[card.key] = adoptedState(card.target, value)
        }
        setDrafts(current => ({ ...current, ...filled }))
        setRevision(value => value + 1)
        setProfileNotice(`Loaded the "${RESERVED_PROFILE}" profile into the live prompt and every editor box.`)
      } else {
        setProfileError('The Default profile could not be loaded into the live prompt.')
      }
    } finally {
      setProfileBusy(null)
    }
  }

  const actionsDisabled = savingCard !== null || loadingCard !== null || !ready || profileBusy !== null
  const anyUnsaved = allCards.some(card => {
    const state = drafts[card.key]
    return state !== undefined && state.draft !== stored(card.target)
  })
  const collapsibleKeys = allCards.map(card => card.key)
  const allCollapsed = collapsibleKeys.length > 0 && collapsibleKeys.every(key => collapsed.has(key))
  const toggleCollapsed = (key: string) => {
    setCollapsed(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const toggleAllCollapsed = () => {
    setCollapsed(allCollapsed ? new Set<string>() : new Set(collapsibleKeys))
  }
  const profileOptions = [...new Set([RESERVED_PROFILE, ...profileNames])]
  const selectedProfile = profileEntry(selectedName)

  return (
    <div style={styles.root}>
      <h2 style={styles.title}>System prompt</h2>
      <p style={styles.hint}>
        Every editable section of the assembled system prompt of a new session.
        Preview shows the FULL prompt as the model sees it, composed from the
        default preset so the per-tool guidance is the real one, with your drafts
        applied. DSH-managed sections (plan mode, code mode) are read-only.
      </p>
      {snapshot.status === 'loading'
        ? <p style={styles.status} role="status">Loading settings…</p>
        : snapshot.status === 'unavailable'
          ? <p style={styles.notice} role="status">Settings are process-local; this page is inert in remote browsers.</p>
          : !writable
            ? <p style={styles.status} role="status">The settings document is read-only; saving is disabled.</p>
            : null}

      {/* The profile toolbar. It governs the whole page, so it sits above every
          editor card: profiles are a property of the prompt, not of one section. */}
      <section aria-label="Profiles" style={styles.profileBar}>
        <div style={styles.profileRow}>
          <span style={styles.profileLabel}>Profile</span>
          <select
            aria-label="Saved profiles"
            style={styles.select}
            value={selection}
            disabled={!ready || profileBusy !== null}
            onChange={event => {
              setSelection(event.target.value)
              setProfileNotice(null)
              setProfileError(null)
              setProfileWarning(null)
              if (event.target.value !== NEW_PROFILE) setNewName('')
            }}
          >
            {profileOptions.map(name => (
              <option key={name} value={name}>
                {name}{name === RESERVED_PROFILE ? ' (baseline)' : ''}
              </option>
            ))}
            <option value={NEW_PROFILE}>New profile…</option>
          </select>
          {creating
            ? (
              <input
                aria-label="New profile name"
                style={styles.input}
                value={newName}
                placeholder="Profile name"
                spellCheck={false}
                disabled={!ready || profileBusy !== null}
                onChange={event => setNewName(event.target.value)}
              />
            )
            : null}
          <span style={styles.caption}>
            {creating
              ? 'Names the profile Save all creates.'
              : selectedProfile === undefined
                ? 'Not stored yet.'
                : savedAtLabel(selectedProfile.savedAt)}
          </span>
        </div>

        <div style={styles.profileRow}>
          <button
            type="button"
            style={(!ready || profileBusy !== null) ? { ...styles.primaryButton, ...styles.disabledButton } : styles.primaryButton}
            disabled={!ready || profileBusy !== null}
            onClick={() => { void handleSaveAll() }}
          >
            {profileBusy === 'save' ? 'Saving…' : 'Save all'}
          </button>
          <button
            type="button"
            style={(actionsDisabled || !writable) ? { ...styles.button, ...styles.disabledButton } : styles.button}
            disabled={actionsDisabled || !writable}
            onClick={() => { void handleLoadAll() }}
          >
            {profileBusy === 'load' ? 'Loading…' : 'Load all'}
          </button>
          <button
            type="button"
            style={(actionsDisabled || !writable) ? { ...styles.button, ...styles.disabledButton } : styles.button}
            disabled={actionsDisabled || !writable}
            onClick={() => { void handleClearAll() }}
          >
            {profileBusy === 'clear' ? 'Clearing…' : 'Clear all'}
          </button>
          <button
            type="button"
            style={(actionsDisabled || !writable) ? { ...styles.button, ...styles.disabledButton } : styles.button}
            disabled={actionsDisabled || !writable}
            onClick={() => { void handleReload() }}
          >
            {profileBusy === 'reload' ? 'Reloading…' : 'Reload from live prompt'}
          </button>
          <button
            type="button"
            style={actionsDisabled ? { ...styles.button, ...styles.disabledButton } : styles.button}
            disabled={actionsDisabled}
            onClick={handleNewProfile}
          >
            New
          </button>
          <button
            type="button"
            style={(actionsDisabled || creating) ? { ...styles.button, ...styles.disabledButton } : styles.button}
            disabled={actionsDisabled || creating}
            onClick={() => { void handleDeleteProfile() }}
          >
            {profileBusy === 'delete' ? 'Deleting…' : 'Delete'}
          </button>
          <button
            type="button"
            style={actionsDisabled ? { ...styles.button, ...styles.disabledButton } : styles.button}
            disabled={actionsDisabled}
            onClick={toggleAllCollapsed}
          >
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        </div>

        <p style={styles.caption}>
          A profile is the prompt library; the boxes below are the live prompt.
          Save all writes every box into the selected profile. Load all applies
          the selected profile to the live prompt and fills every box with it.
          Clear all removes every override, so the shipping deployment prompt is
          back in force, and leaves the saved profiles alone.
        </p>

        {profileNotice
          ? <p style={styles.notice} role="status">{profileNotice}</p>
          : null}
        {profileError
          ? <p style={styles.error} role="status">{profileError}</p>
          : null}
        {profileWarning
          ? <p style={styles.caution} role="status">{profileWarning}</p>
          : null}
        {selectedName === RESERVED_PROFILE
          ? (
            <div style={styles.profileRow}>
              <span style={styles.caption}>
                The Default profile is the baseline a reset lands on, so it cannot be deleted.
                Fill the boxes and press Save all to redefine it.
              </span>
              <button
                type="button"
                style={actionsDisabled || !writable ? { ...styles.button, padding: '2px 10px', fontSize: '12px', ...styles.disabledButton } : { ...styles.button, padding: '2px 10px', fontSize: '12px' }}
                disabled={actionsDisabled || !writable}
                onClick={() => { void handleResetToDefaultProfile() }}
              >
                Apply Default
              </button>
              <span style={styles.caption}>
                Clear all goes further: it ignores the Default profile and restores the shipping deployment prompt.
              </span>
            </div>
          )
          : null}
      </section>

      {allCards.map(card => {
        const state = drafts[card.key] ?? INITIAL_STATE
        const storedValue = stored(card.target)
        const storedChanged = state.editStartedFrom !== null && state.editStartedFrom !== storedValue
        const saveDisabled = actionsDisabled || !ready || !writable
        const isCollapsed = collapsed.has(card.key)
        return (
          <section key={card.key} aria-label={card.label} style={styles.card}>
            <div style={styles.heading}>
              <button
                type="button"
                aria-expanded={!isCollapsed}
                aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${card.label}`}
                style={styles.cardHeaderButton}
                onClick={() => toggleCollapsed(card.key)}
              >
                <span style={styles.caret}>{isCollapsed ? '▶' : '▼'}</span>
                <h3 style={{ ...styles.title, fontSize: '13.5px' }}>{card.label}</h3>
                <span style={styles.orderChip}>{card.orderLabel}</span>
                {state.draft !== storedValue
                  ? <span style={state.draft === '' && storedValue !== '' ? styles.profileBadge : styles.badge}>Unsaved</span>
                  : null}
              </button>
            </div>
            {isCollapsed
              ? (
                <p style={styles.hint}>
                  {state.draft === storedValue
                    ? 'Collapsed.'
                    : `Collapsed with unsaved text (${state.draft.length} characters). Expand to review it before saving.`}
                </p>
              )
              : (
                <>
                  <textarea
                    aria-label={card.label}
                    value={state.draft}
                    onChange={event => handleEdit(card.key, event.target.value)}
                    disabled={!ready}
                    spellCheck={false}
                    style={styles.editor}
                  />
                  <p style={styles.hint}>{card.hint}</p>
                  {card.caution !== undefined
                    ? <p style={styles.caution}>{card.caution}</p>
                    : null}
                  {storedChanged
                    ? <p style={styles.notice} role="status">The stored value changed while you were editing; your draft is kept. Load to re-read it.</p>
                    : null}
                  {state.outcome?.status === 'error'
                    ? <p style={styles.error} role="status">Save failed: {state.outcome.message}</p>
                    : state.outcome?.status === 'not-applied'
                      ? <p style={styles.error} role="status">Save did not take effect — the stored value may have changed. Load to re-read it. Your draft is kept.</p>
                      : state.outcome?.status === 'saved'
                        ? <p style={styles.status} role="status">Saved.</p>
                        : null}
                  {state.loadNote
                    ? <p style={styles.notice} role="status">{state.loadNote}</p>
                    : null}
                  <div style={styles.actions}>
                    <button
                      type="button"
                      style={saveDisabled ? { ...styles.primaryButton, ...styles.disabledButton } : styles.primaryButton}
                      disabled={saveDisabled}
                      onClick={() => { void handleSave(card.key) }}
                    >
                      {savingCard === card.key ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      style={actionsDisabled ? { ...styles.button, ...styles.disabledButton } : styles.button}
                      disabled={actionsDisabled}
                      onClick={() => { void handlePreview() }}
                    >
                      Preview system prompt
                    </button>
                    <button
                      type="button"
                      style={actionsDisabled ? { ...styles.button, ...styles.disabledButton } : styles.button}
                      disabled={actionsDisabled}
                      onClick={() => { void handleLoad(card.key) }}
                    >
                      {loadingCard === card.key ? 'Loading…' : 'Load current system prompt'}
                    </button>
                  </div>
                </>
              )}
          </section>
        )
      })}

      {preview.open
        ? (
          <section aria-label="Full system prompt preview">
            <div style={styles.previewHeader}>
              <span style={styles.status}>
                {preview.loading ? 'Assembling the full system prompt…' : 'Full system prompt (drafts applied)'}
              </span>
              {preview.loading || anyUnsaved
                ? <span style={styles.badge}>Unsaved drafts</span>
                : null}
            </div>
            {preview.error
              ? <p style={styles.error} role="status">Preview failed: {preview.error}</p>
              : null}
            {preview.result === null && !preview.loading && preview.error === null
              ? <p style={styles.hint}>Nothing assembled yet.</p>
              : null}
            {preview.result !== null
              ? (
                <>
                  {scopeNotice(preview.result.scope) !== null
                    ? <p style={styles.hint}>{scopeNotice(preview.result.scope)}</p>
                    : null}
                  {preview.result.error
                    ? (
                      <>
                        <p style={styles.error} role="status">
                          Variable interpolation failed: {preview.result.error}
                        </p>
                        <p style={styles.hint}>Showing the raw sections below (variables unresolved).</p>
                      </>
                    )
                    : null}
                  {preview.result.sections.length === 0
                    ? <p style={styles.hint}>The assembled prompt is empty.</p>
                    : preview.result.sections.map(section_ => (
                      <div key={section_.name}>
                        <div style={styles.sectionLabel}>
                          <span style={styles.orderChip}>{BAND_LABELS[section_.band]}{section_.order === undefined ? '' : ` · ${section_.order}`}</span>
                          <span style={styles.caption}>{section_.name}</span>
                          {MANAGED_SECTION_NAMES.has(section_.name)
                            ? <span style={styles.managedBadge}>Managed by DSH</span>
                            : null}
                        </div>
                        <pre style={styles.sectionBlock}>{section_.text}</pre>
                      </div>
                    ))}
                  <p style={styles.caption}>
                    Sections render in order, joined with blank lines; this is
                    the full prompt the model reads. {'{{name}}'} variables
                    (e.g. {'{{model}}'}, {'{{provider}}'}) resolve from the
                    default model selection where it exists; a reference with
                    no scope-less value (like {'{{cwd}}'}) stays literal here
                    and resolves per session. The preview carries the preset
                    composition named above but no specific agent, so sections a
                    session alone contributes (a per-session value, or an agent's
                    own preset) may differ.
                  </p>
                </>
              )
              : null}
          </section>
        )
        : null}
    </div>
  )
}

/**
 * Merge newly found cards into the discovered list, keeping the existing card
 * object for a key that is already there so React does not remount the card (and
 * so an unsaved draft in it survives a Preview).
 * @param current - the discovered cards the panel already holds.
 * @param found - cards derived from a preview or a loaded profile.
 * @returns the merged list.
 */
function mergeCards(current: readonly EditorCard[], found: readonly EditorCard[]): EditorCard[] {
  const byKey = new Map(current.map(card => [card.key, card]))
  let changed = false
  for (const card of found) {
    if (byKey.has(card.key)) continue
    byKey.set(card.key, card)
    changed = true
  }
  return changed ? [...byKey.values()] : (current as EditorCard[])
}
