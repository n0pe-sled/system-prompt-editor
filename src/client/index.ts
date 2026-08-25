/**
 * Browser half of the System Prompt Editor plugin: registers the Settings page
 * (the `settings.section` slot) for editing the three system-prompt fields —
 * custom text, persona, and tool guidance — and mounts the preview Remote that
 * assembles the FULL prompt host-side (identity + persona + tool guidance +
 * custom text, drafts applied).
 *
 * The bound settings scope is created ONCE in apply (its disposer belongs to
 * this plugin's fiber; observable identity must stay stable across inject
 * factory calls so the renderer's hook binding is cached per source). The
 * `save` callback wraps the scope write and reads the section back afterwards,
 * mirroring the write-back verification pattern of the plugin settings cards.
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
  SystemPromptEditorPreviewOutcome, SystemPromptEditorSaveOutcome, SystemPromptField,
  SystemPromptSettingsSection,
} from './SystemPromptEditorPanel.tsx'
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

export type {
  SystemPromptEditorPreviewOutcome, SystemPromptEditorSaveOutcome, SystemPromptField,
  SystemPromptSettingsSection,
} from './SystemPromptEditorPanel.tsx'
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

  const save = async (field: SystemPromptField, value: string): Promise<SystemPromptEditorSaveOutcome> => {
    try {
      await scope.set(field, value)
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
    // After set() settles, the scope snapshot already reflects the folded
    // write answer or the recovery read — the Host is the only authority on
    // whether the value landed, so it is read back rather than predicted.
    return scope.getSnapshot().value?.[field] === value
      ? { status: 'saved' }
      : { status: 'not-applied' }
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
      preview,
    }),
  }, SystemPromptEditorPanel))
}
