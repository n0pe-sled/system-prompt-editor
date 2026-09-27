/**
 * Browser half of the System Prompt Editor plugin: registers the Settings page
 * (the `settings.section` slot) for editing the three system-prompt fields —
 * custom text, persona, and tool guidance — and mounts the preview Remote that
 * assembles the FULL prompt host-side (identity + persona + tool guidance +
 * custom text, drafts applied).
 *
 * The bound settings scope is created ONCE in apply (its disposer belongs to
 * this plugin's fiber; observable identity must stay stable across inject
 * factory calls so the renderer's hook binding is cached per source). Every
 * write callback wraps a scope write and reads the section back afterwards,
 * mirroring the write-back verification pattern of the plugin settings cards:
 * `save` for one field or section key, `applyAll` for the whole editable
 * prompt at once, `clearAll` to unset every override, and
 * `saveProfile`/`deleteProfile` for the named snapshots the panel's dropdown
 * lists.
 *
 * The Remote contribution is mounted lazily: `$mount` starts here (so its
 * effect is fiber-owned and unwinds with the plugin), but its rejection is
 * contained and only surfaced through the `preview` callback — a mount
 * failure must not take down the Settings page, it only disables Preview.
 *
 * Export discipline (packages/client/AGENTS.md): the ./client entry exports
 * only `apply`/`inject` and shared types; the component stays internal.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls in the settings.section slot declaration + ctx.settingsScope merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: ctx.slots and the SlotMap types.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { SystemPromptEditorPanel } from './SystemPromptEditorPanel.tsx'
import type {
  SystemPromptEditorPreviewOutcome, SystemPromptEditorSaveOutcome,
  SystemPromptSaveTarget, SystemPromptSettingsSection,
} from './SystemPromptEditorPanel.tsx'
import type { SystemPromptProfile } from '../shared/section.ts'
import { PREVIEW_DESCRIPTOR } from '../shared/remote.ts'
import type { SystemPromptDrafts, SystemPromptPreviewResult } from '../shared/remote.ts'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

/**
 * The mounted preview namespace, resolved through the service store rather
 * than the inject-gated proxy (see {@link apply} for why).
 */
interface SystemPromptPreviewNamespace {
  preview(drafts: SystemPromptDrafts): Promise<RemoteResult<SystemPromptPreviewResult>>
}

/** Drop empty section entries: empty already means "keep the default", so storing the key adds nothing. */
function withoutEmptySections(sections: Readonly<Record<string, string>>): Record<string, string> {
  const kept: Record<string, string> = {}
  for (const [name, text] of Object.entries(sections)) {
    if (text !== '') kept[name] = text
  }
  return kept
}

/** Whether two section maps hold the same names with the same text. */
function sameStringMap(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean {
  const names = Object.keys(left)
  if (names.length !== Object.keys(right).length) return false
  return names.every(name => left[name] === right[name])
}

/**
 * Whether a profile read back from the Host is the profile that was written.
 * Content only: `savedAt` is client-stamped, so it must never make a
 * successful write look like a mismatch.
 */
function sameProfile(left: SystemPromptProfile, right: SystemPromptProfile): boolean {
  return left.text === right.text
    && left.persona === right.persona
    && left.toolGuidance === right.toolGuidance
    && sameStringMap(left.sections, right.sections)
}

export type {
  SystemPromptEditorPreviewOutcome, SystemPromptEditorSaveOutcome,
  SystemPromptSaveTarget, SystemPromptSettingsSection,
} from './SystemPromptEditorPanel.tsx'
export type { SystemPromptProfile } from '../shared/section.ts'
export type { SystemPromptEditorPanelProps } from './SystemPromptEditorPanel.tsx'
export type { SystemPromptEditorInjected } from './SystemPromptEditorPanel.tsx'
export type { SystemPromptDrafts } from '../shared/remote.ts'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'settingsScope', 'remote']

/**
 * Register the Settings page for the system-prompt-editor namespace.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  // The `settingsScope` service is provided by ui-settings, which may activate
  // after us — the fiber inject already waited on it; `slots.inject` waits on
  // the slot declaration and cleans up with this fiber.
  const scope = ctx.settingsScope.bind<SystemPromptSettingsSection>({ namespace: 'system-prompt-editor' })

  const save = async (target: SystemPromptSaveTarget, value: string): Promise<SystemPromptEditorSaveOutcome> => {
    try {
      if (target.kind === 'field') {
        await scope.set(target.field, value)
      } else {
        // Generic section map: read-modify-write one key. An empty value
        // removes the key so the stored document carries no stale override.
        const current = scope.getSnapshot().value?.sections ?? {}
        const next: Record<string, string> = { ...current }
        if (value === '') {
          delete next[target.name]
        } else {
          next[target.name] = value
        }
        await scope.set('sections', next)
      }
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
    // After set() settles, the scope snapshot already reflects the folded
    // write answer or the recovery read — the Host is the only authority on
    // whether the value landed, so it is read back rather than predicted.
    const snapshot = scope.getSnapshot()
    const landed = target.kind === 'field'
      ? snapshot.value?.[target.field]
      : (snapshot.value?.sections?.[target.name] ?? '')
    return landed === value
      ? { status: 'saved' }
      : { status: 'not-applied' }
  }

  /** The saved profiles as the scope currently holds them. */
  const readProfiles = (): Record<string, SystemPromptProfile | undefined> =>
    scope.getSnapshot().value?.profiles ?? {}

  /**
   * Write the whole editable prompt in one gesture: the three fields, then the
   * section map as a WHOLESALE replacement rather than a read-modify-write per
   * key, so clearing the prompt also drops section keys whose card is no longer
   * on the page.
   *
   * An empty value UNSETS its field instead of storing an empty string. Both
   * spellings reach the override helper as "keep the default", but only one of
   * them survives a later Clear all: a stored empty string is a key the clear
   * has to remove, and a namespace that still carries empty keys is a namespace
   * that looks like it refused the clear. Unsetting also means a profile loaded
   * with empty fields cannot pin the deployment default out of the way.
   * @param values - every editable field, as the panel's boxes currently hold them.
   * @returns what the read-back settled as.
   */
  const applyAll = async (values: SystemPromptDrafts): Promise<SystemPromptEditorSaveOutcome> => {
    const sections = withoutEmptySections(values.sections)
    const before = scope.getSnapshot().value
    /** Clear a field when it is going empty, set it otherwise. */
    const writeField = async (field: 'text' | 'persona' | 'toolGuidance', value: string): Promise<void> => {
      if (value === '') {
        if ((before?.[field] ?? '') !== '') await scope.unset(field)
      } else {
        await scope.set(field, value)
      }
    }
    try {
      await writeField('text', values.text)
      await writeField('persona', values.persona)
      await writeField('toolGuidance', values.toolGuidance)
      // The section map is always replaced (never merged), so it is set when it
      // has entries and unset when it has none.
      if (Object.keys(sections).length === 0) {
        if (Object.keys(before?.sections ?? {}).length > 0) await scope.unset('sections')
      } else {
        await scope.set('sections', sections)
      }
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
    const landed = scope.getSnapshot().value
    const applied = (landed?.text ?? '') === values.text
      && (landed?.persona ?? '') === values.persona
      && (landed?.toolGuidance ?? '') === values.toolGuidance
      && sameStringMap(landed?.sections ?? {}, sections)
    return applied ? { status: 'saved' } : { status: 'not-applied' }
  }

  /**
   * Persist one named profile, replacing any profile already under that name.
   * @param name - the profile name the user typed.
   * @param profile - the snapshot to store under it.
   * @returns what the read-back settled as.
   */
  const saveProfile = async (name: string, profile: SystemPromptProfile): Promise<SystemPromptEditorSaveOutcome> => {
    const stored: SystemPromptProfile = {
      text: profile.text,
      persona: profile.persona,
      toolGuidance: profile.toolGuidance,
      sections: withoutEmptySections(profile.sections),
      savedAt: new Date().toISOString(),
    }
    try {
      await scope.set('profiles', { ...readProfiles(), [name]: stored })
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
    const landed = scope.getSnapshot().value?.profiles?.[name]
    return landed !== undefined && sameProfile(landed, stored)
      ? { status: 'saved' }
      : { status: 'not-applied' }
  }

  /**
   * Remove one named profile. Deleting a name that is already gone is a
   * success: the caller asked for an absent profile and got one.
   * @param name - the profile name to remove.
   * @returns what the read-back settled as.
   */
  const deleteProfile = async (name: string): Promise<SystemPromptEditorSaveOutcome> => {
    const current = readProfiles()
    if (!Object.hasOwn(current, name)) return { status: 'saved' }
    const next = { ...current }
    delete next[name]
    try {
      // Removing the last profile leaves no map worth storing: clear the field
      // so the document carries no empty key.
      if (Object.keys(next).length === 0) {
        await scope.unset('profiles')
      } else {
        await scope.set('profiles', next)
      }
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
    const landed = scope.getSnapshot().value?.profiles ?? {}
    return Object.hasOwn(landed, name) ? { status: 'not-applied' } : { status: 'saved' }
  }

  /**
   * Remove every live override so the deployment defaults come back. The saved
   * profiles stay untouched: they are the library, not the live prompt, and
   * Clear all is what the panel pairs with applying the Default profile.
   *
   * Each field is UNSET rather than set to empty. Empty and absent already
   * mean the same thing to the override helper, but unsetting drops the key
   * from the settings document, so a cleared namespace looks cleared.
   * @returns what the read-back settled as.
   */
  const clearAll = async (): Promise<SystemPromptEditorSaveOutcome> => {
    try {
      await scope.unset('text')
      await scope.unset('persona')
      await scope.unset('toolGuidance')
      await scope.unset('sections')
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
    const landed = scope.getSnapshot().value
    const cleared = (landed?.text ?? '') === ''
      && (landed?.persona ?? '') === ''
      && (landed?.toolGuidance ?? '') === ''
      && Object.keys(landed?.sections ?? {}).length === 0
    return cleared ? { status: 'saved' } : { status: 'not-applied' }
  }

  // Mount the preview Remote for this plugin's fiber. Not awaited: a mount
  // failure (endpoint collision, carrier offline) must only disable Preview,
  // not fail plugin activation. `preview()` awaits this same promise, so the
  // contained rejection is still reported there.
  const mount = ctx.remote.$mount({
    package: 'dsh-system-prompt-editor',
    descriptors: [PREVIEW_DESCRIPTOR],
  })
  mount.catch(() => {})

  const preview = async (drafts: SystemPromptDrafts): Promise<SystemPromptEditorPreviewOutcome> => {
    try {
      await mount
      // The Preview namespace is surfaced as the Cordis service
      // `remote.systemPromptEditorPreview`. It is not listed in this plugin's
      // `inject` — that service is created by OUR OWN $mount, which runs from
      // this apply, so injecting it here would deadlock the fiber (it would
      // park waiting for a service only its own activation can create). The
      // namespace is resolved through the service store (ctx.get) instead,
      // which needs no inject; the `await mount` above guarantees it exists
      // unless the mount itself failed, which is reported below.
      const namespace = ctx.get('remote.systemPromptEditorPreview') as SystemPromptPreviewNamespace | undefined
      if (namespace === undefined) {
        return { status: 'error', message: 'Preview is unavailable — the preview remote is not mounted.' }
      }
      const result = await namespace.preview(drafts)
      if (result.ok) return { status: 'previewed', result: result.value }
      return { status: 'error', message: `Preview failed: ${result.error.message} (${result.error.code})` }
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'system-prompt-editor',
    order: 200,
    label: 'System Prompt',
    inject: () => ({
      hooks: { systemPromptSettings: scope },
      save,
      applyAll,
      saveProfile,
      deleteProfile,
      clearAll,
      preview,
    }),
  }, SystemPromptEditorPanel))
}
