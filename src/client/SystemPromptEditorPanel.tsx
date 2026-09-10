/**
 * The System Prompt Editor settings page: one editor card per curated,
 * editable section (Tier A — identity, source, web surface, persona,
 * file-reference, tool guidance, deliverables, custom), plus cards for
 * third-party sections discovered through the last preview (Tier B), each
 * with the same three actions — Save, Preview system prompt, and Load current
 * system prompt — and a shared preview of the FULL assembled prompt annotated
 * by band, with DSH-managed sections shown read-only.
 *
 * Everything arrives through the props shares (AGENTS.md): the bound scope
 * snapshot through the injected `useSystemPromptSettings` selector hook, the
 * write path through the injected `save` callback, and the host-side assembly
 * through the injected `preview` callback. The component never sees ctx nor
 * the scope source itself.
 */

import { useEffect, useMemo, useState } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import {
  SECTION_CATALOG, MANAGED_SECTION_NAMES, CATALOG_SECTION_NAMES, TOOL_SECTION_PREFIX,
  PERSONA_SECTION, TOOL_GUIDANCE_SECTION,
} from '../shared/catalog.ts'
import type {
  SystemPromptDrafts, SystemPromptPreviewResult, SystemPromptSectionBand,
} from '../shared/remote.ts'

/** The settings section this plugin stores: three free-text fields plus a generic section map. */
export interface SystemPromptSettingsSection {
  text?: string
  persona?: string
  toolGuidance?: string
  /** Per-section overrides keyed by registry name. */
  sections?: Record<string, string>
}

/** Where one Save lands: a top-level field or one key of the generic section map. */
export type SystemPromptSaveTarget =
  | { readonly kind: 'field'; readonly field: 'text' | 'persona' | 'toolGuidance' }
  | { readonly kind: 'section'; readonly name: string }

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

/** Display label for the tool-guidance band (a range, not one order). */
const TOOL_BAND_ORDER_LABEL = 'orders 100–199'

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

/** Assembling with empty drafts returns the CURRENT effective prompt (stored overrides applied). */
const EMPTY_DRAFTS: SystemPromptDrafts = { text: '', persona: '', toolGuidance: '', sections: {} }

/**
 * The effective text of one card target from a fresh assembly: the stored
 * override when one exists, otherwise the deployment default. Field targets
 * map to their registry section; the tool band falls back to joining the
 * per-tool guidance sections when no replacement is stored. Returns undefined
 * when the assembly has no text for the target (custom section by default,
 * per-agent sections absent from the scope-less preview).
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
  preview: {
    margin: 0,
    padding: '12px 14px',
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
  const stored = (target: SystemPromptSaveTarget): string => {
    if (target.kind === 'field') return snapshot.value?.[target.field] ?? ''
    return snapshot.value?.sections?.[target.name] ?? ''
  }

  // Curated cards are static; discovered cards extend after a preview.
  const curated = useMemo(curatedCards, [])
  const [discovered, setDiscovered] = useState<EditorCard[]>([])

  const [drafts, setDrafts] = useState<Record<string, CardState>>(initialCards)
  const [savingCard, setSavingCard] = useState<string | null>(null)
  const [loadingCard, setLoadingCard] = useState<string | null>(null)
  const [preview, setPreview] = useState(PREVIEW_STATE)

  const allCards = useMemo(() => [...curated, ...discovered], [curated, discovered])
  const cardByKey = useMemo(() => {
    const map = new Map<string, EditorCard>()
    for (const card of allCards) map.set(card.key, card)
    return map
  }, [allCards])

  // Adopt external changes while a card's draft is untouched; keep the draft
  // once edited (the hint renders from editStartedFrom instead).
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
  }, [snapshot.value, allCards])

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
        loadNote = 'No stored value, and no tool-guidance sections are visible yet — they register per agent. '
          + 'Run one session first: the plugin snapshots the real per-tool guidance during assembly, and Load will then replay it.'
      } else if (picked === undefined && storedValue === '') {
        loadNote = 'Nothing to load — no stored value, and this preview has no text for the section (it may be per-agent or empty). '
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

  const handlePreview = async () => {
    setPreview(current => ({ ...current, open: true, loading: true, error: null }))
    const sectionDrafts = allCards.reduce<Record<string, string>>((acc, card) => {
      if (card.target.kind === 'section') acc[card.target.name] = drafts[card.key]?.draft ?? ''
      return acc
    }, {})
    const outcome = await props.preview({
      text: drafts['field:text']?.draft ?? '',
      persona: drafts['field:persona']?.draft ?? '',
      toolGuidance: drafts['field:toolGuidance']?.draft ?? '',
      sections: sectionDrafts,
    })
    if (outcome.status === 'previewed') {
      setPreview(current => ({ ...current, loading: false, error: null, result: outcome.result }))
      // Discover third-party sections (Tier B) from the assembled prompt so
      // they become editable without a plugin update.
      setDiscovered(discoveredCards(outcome.result.sections))
    } else {
      setPreview(current => ({ ...current, loading: false, error: outcome.message, result: null }))
    }
  }

  const actionsDisabled = savingCard !== null || loadingCard !== null || !ready
  const anyUnsaved = allCards.some(card => {
    const state = drafts[card.key]
    return state !== undefined && state.draft !== stored(card.target)
  })

  return (
    <div style={styles.root}>
      <h2 style={styles.title}>System prompt</h2>
      <p style={styles.hint}>
        Every editable section of the assembled system prompt of a new session.
        Preview shows the FULL prompt as the model sees it, with your drafts
        applied. DSH-managed sections (plan mode, code mode) are read-only.
      </p>
      {snapshot.status === 'loading'
        ? <p style={styles.status} role="status">Loading settings…</p>
        : snapshot.status === 'unavailable'
          ? <p style={styles.notice} role="status">Settings are process-local; this page is inert in remote browsers.</p>
          : !snapshot.writable
            ? <p style={styles.status} role="status">The settings document is read-only; saving is disabled.</p>
            : null}

      {allCards.map(card => {
        const state = drafts[card.key] ?? INITIAL_STATE
        const storedValue = stored(card.target)
        const storedChanged = state.editStartedFrom !== null && state.editStartedFrom !== storedValue
        const saveDisabled = actionsDisabled || !ready || !snapshot.writable
        return (
          <section key={card.key} aria-label={card.label} style={styles.card}>
            <div style={styles.heading}>
              <h3 style={{ ...styles.title, fontSize: '13.5px' }}>{card.label}</h3>
              <span style={styles.orderChip}>{card.orderLabel}</span>
              {state.draft !== storedValue
                ? <span style={styles.badge}>Unsaved</span>
                : null}
            </div>
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
                    : preview.result.sections.map(section => (
                      <div key={section.name}>
                        <div style={styles.sectionLabel}>
                          <span style={styles.orderChip}>{BAND_LABELS[section.band]}{section.order === undefined ? '' : ` · ${section.order}`}</span>
                          <span style={styles.caption}>{section.name}</span>
                          {MANAGED_SECTION_NAMES.has(section.name)
                            ? <span style={styles.managedBadge}>Managed by DSH</span>
                            : null}
                        </div>
                        <pre style={styles.sectionBlock}>{section.text}</pre>
                      </div>
                    ))}
                  <p style={styles.caption}>
                    Sections render in order, joined with blank lines; this is
                    the full prompt the model reads. {'{{name}}'} variables
                    (e.g. {'{{model}}'}, {'{{provider}}'}) resolve from the
                    default model selection where it exists; a reference with
                    no scope-less value (like {'{{cwd}}'}) stays literal here
                    and resolves per session. This preview assembles without a
                    specific agent, so per-agent presets and per-agent
                    sections (like the file-reference note) may differ.
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
