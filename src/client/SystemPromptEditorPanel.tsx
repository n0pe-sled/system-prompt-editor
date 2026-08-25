/**
 * The System Prompt Editor settings page: three multiline editors over the
 * `system-prompt-editor` settings namespace (custom text, persona, tool
 * guidance), each with the same three actions — Save, Preview system prompt,
 * and Load current system prompt — plus a shared preview of the FULL assembled
 * prompt (identity + persona + tool guidance + custom text, drafts applied),
 * annotated by band.
 *
 * Everything arrives through the props shares (AGENTS.md): the bound scope
 * snapshot through the injected `useSystemPromptSettings` selector hook, the
 * write path through the injected `save` callback, and the host-side assembly
 * through the injected `preview` callback. The component never sees ctx nor
 * the scope source itself.
 */

import { useEffect, useState } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  SystemPromptDrafts, SystemPromptPreviewResult, SystemPromptSectionBand,
} from '../shared/remote.ts'

/** The settings section this plugin stores: three free-text fields. */
export interface SystemPromptSettingsSection {
  text?: string
  persona?: string
  toolGuidance?: string
}

/** One of the three editable fields. */
export type SystemPromptField = 'text' | 'persona' | 'toolGuidance'

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
  save: (field: SystemPromptField, value: string) => Promise<SystemPromptEditorSaveOutcome>
  /** Assemble the full prompt host-side with all drafts applied. */
  preview: (drafts: SystemPromptDrafts) => Promise<SystemPromptEditorPreviewOutcome>
}

/** Full component props: section owner share + inject face. */
export type SystemPromptEditorPanelProps =
  PropsRuntime<'settings.section'> & InjectFace<SystemPromptEditorInjected>

const MONOSPACE = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'

/** One card's definition: which field, what the card is called, where it lands. */
interface FieldCard {
  readonly field: SystemPromptField
  readonly title: string
  readonly orderLabel: string
  readonly hint: string
}

const CARDS: readonly FieldCard[] = [
  {
    field: 'text',
    title: 'Custom system prompt text',
    orderLabel: 'order 200',
    hint: 'Appended verbatim after the persona and tool guidance.',
  },
  {
    field: 'persona',
    title: 'Persona',
    orderLabel: 'order 0',
    hint: 'Overrides the deployment persona when non-empty; empty keeps the deployment default.',
  },
  {
    field: 'toolGuidance',
    title: 'Tool guidance',
    orderLabel: 'orders 100–199',
    hint: 'Replaces the per-tool guidance sections when non-empty; empty keeps the defaults.',
  },
]

const BAND_LABELS: Record<SystemPromptSectionBand, string> = {
  identity: 'Harness identity',
  persona: 'Persona',
  'tool-guidance': 'Tool guidance',
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

/**
 * Render the System Prompt settings page.
 * @param props - section owner share plus the injected scope face.
 * @returns the page.
 */
export function SystemPromptEditorPanel(props: SystemPromptEditorPanelProps) {
  const snapshot = props.useSystemPromptSettings(s => s)
  const ready = snapshot.status === 'ready'
  const stored = (field: SystemPromptField): string => snapshot.value?.[field] ?? ''
  const [cards, setCards] = useState<Record<SystemPromptField, CardState>>({
    text: INITIAL_STATE,
    persona: INITIAL_STATE,
    toolGuidance: INITIAL_STATE,
  })
  const [savingField, setSavingField] = useState<SystemPromptField | null>(null)
  const [preview, setPreview] = useState(PREVIEW_STATE)

  // Adopt external changes while a card's draft is untouched; keep the draft
  // once edited (the hint renders from editStartedFrom instead).
  useEffect(() => {
    setCards(current => {
      let next = current
      for (const field of CARDS.map(card => card.field)) {
        if (current[field]?.editStartedFrom !== null) continue
        const adopted = stored(field)
        if (current[field]?.draft === adopted) continue
        next = { ...next, [field]: { ...current[field]!, draft: adopted } }
      }
      return next
    })
  }, [snapshot.value])

  const handleEdit = (field: SystemPromptField, text: string) => {
    setCards(current => ({
      ...current,
      [field]: {
        draft: text,
        editStartedFrom: current[field]?.editStartedFrom ?? stored(field),
        outcome: null,
        loadNote: null,
      },
    }))
  }

  const handleSave = async (field: SystemPromptField) => {
    const value = cards[field]?.draft ?? ''
    setSavingField(field)
    setCards(current => ({ ...current, [field]: { ...current[field]!, outcome: null } }))
    try {
      const result = await props.save(field, value)
      setCards(current => ({
        ...current,
        [field]: {
          ...current[field]!,
          outcome: result,
          editStartedFrom: result.status === 'saved' ? null : current[field]!.editStartedFrom,
        },
      }))
    } finally {
      setSavingField(null)
    }
  }

  const handleLoad = (field: SystemPromptField) => {
    const value = stored(field)
    setCards(current => {
      const state = current[field]!
      let draft = value
      let loadNote: string | null = null
      if (value === '') {
        if (field === 'persona') {
          // Nothing stored: fall back to the deployment default the client
          // cannot see, captured from the last preview (when it is not this
          // card's own draft, which would be circular).
          const deployed = preview.result?.sections.find(section =>
            section.band === 'persona' && section.text !== state.draft)?.text
          if (deployed !== undefined && deployed !== '') {
            draft = deployed
            loadNote = 'No stored persona — loaded the deployment default from the last preview. Saving it stores a fixed override.'
          } else {
            loadNote = 'No stored persona; the deployment default remains in effect.'
          }
        } else {
          loadNote = 'Nothing stored — the default sections remain in effect.'
        }
      }
      return { ...current, [field]: { ...state, draft, editStartedFrom: null, outcome: null, loadNote } }
    })
  }

  const handlePreview = async () => {
    setPreview(current => ({ ...current, open: true, loading: true, error: null }))
    const outcome = await props.preview({
      text: cards.text?.draft ?? '',
      persona: cards.persona?.draft ?? '',
      toolGuidance: cards.toolGuidance?.draft ?? '',
    })
    if (outcome.status === 'previewed') {
      setPreview(current => ({ ...current, loading: false, error: null, result: outcome.result }))
    } else {
      setPreview(current => ({ ...current, loading: false, error: outcome.message, result: null }))
    }
  }

  const actionsDisabled = savingField !== null || !ready
  const anyUnsaved = CARDS.some(card => {
    const state = cards[card.field]
    return state !== undefined && state.draft !== stored(card.field)
  })

  return (
    <div style={styles.root}>
      <h2 style={styles.title}>System prompt</h2>
      <p style={styles.hint}>
        Three fields feed the assembled system prompt of every new session.
        Preview shows the FULL prompt as the model sees it, with your drafts
        applied.
      </p>
      {snapshot.status === 'loading'
        ? <p style={styles.status} role="status">Loading settings…</p>
        : snapshot.status === 'unavailable'
          ? <p style={styles.notice} role="status">Settings are process-local; this page is inert in remote browsers.</p>
          : !snapshot.writable
            ? <p style={styles.status} role="status">The settings document is read-only; saving is disabled.</p>
            : null}

      {CARDS.map(card => {
        const state = cards[card.field] ?? INITIAL_STATE
        const storedValue = stored(card.field)
        const storedChanged = state.editStartedFrom !== null && state.editStartedFrom !== storedValue
        const saveDisabled = actionsDisabled || !ready || !snapshot.writable
        return (
          <section key={card.field} aria-label={card.title} style={styles.card}>
            <div style={styles.heading}>
              <h3 style={{ ...styles.title, fontSize: '13.5px' }}>{card.title}</h3>
              <span style={styles.orderChip}>{card.orderLabel}</span>
              {state.draft !== storedValue
                ? <span style={styles.badge}>Unsaved</span>
                : null}
            </div>
            <textarea
              aria-label={card.title}
              value={state.draft}
              onChange={event => handleEdit(card.field, event.target.value)}
              disabled={!ready}
              spellCheck={false}
              style={styles.editor}
            />
            <p style={styles.hint}>{card.hint}</p>
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
                onClick={() => { void handleSave(card.field) }}
              >
                {savingField === card.field ? 'Saving…' : 'Save'}
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
                onClick={() => handleLoad(card.field)}
              >
                Load current system prompt
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
                        </div>
                        <pre style={styles.sectionBlock}>{section.text}</pre>
                      </div>
                    ))}
                  <p style={styles.caption}>
                    Sections render in order, joined with blank lines; this is
                    the full prompt the model reads. {'{{name}}'} variables
                    (e.g. {'{{cwd}}'}, {'{{model}}'}, {'{{provider}}'}) resolve
                    at request time; a strict unresolved reference reports the
                    error above instead of rendering. This preview assembles
                    without a specific agent, so per-agent presets may differ.
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
