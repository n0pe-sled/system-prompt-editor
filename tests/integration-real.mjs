/**
 * Real-provider integration check for dsh-system-prompt-editor (no framework):
 * boots a real cordis context with the real `dsh-system-prompt` registry and
 * the real file-backed `dsh-settings-file` provider (in a TEMP dir — never
 * $DSH_HOME), mounts this plugin, and asserts on the assembled/rendered prompt
 * before and after a persisted write, including the per-section map, the
 * settings document round-trip, and the scope the preview assembles under.
 *
 * Run with: node tests/integration-real.mjs (after `pnpm build`).
 */

import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { createScope } from '@deepseek-ai/dsh-scope'
import { apply, Config, inject, name } from '../lib/index.js'

// Machine-independent harness checkout: set DSH_HARNESS_CHECKOUT to the dsh
// source tree, or fall back to the sibling directory of this plugins checkout
// (the usual `dsh` repo layout is <checkout-root>/deepseek-harness next to
// <checkout-root>/deepseek-harness-plugins).
const HARNESS_ROOT = process.env.DSH_HARNESS_CHECKOUT
  ?? fileURLToPath(new URL('../../../deepseek-harness/', import.meta.url))
const settingsFile = await import(pathToFileURL(`${HARNESS_ROOT}/packages/settings/settings-file/lib/index.js`))
const { FileSettingsProvider } = settingsFile

const dir = await mkdtemp(join(tmpdir(), 'dsh-spe-'))
const settingsPath = join(dir, 'settings.yaml')
const ctx = new Context()
let disposed = false

try {
  const settingsFiber = await ctx.plugin(FileSettingsProvider, { path: settingsPath, watch: false })
  const promptFiber = await ctx.plugin(SystemPrompt, { persona: 'You work at Acme.' })
  // The real gateway is not part of this headless check; a minimal typert stub
  // satisfies the plugin's contribution registration.
  ctx.provide('typert', { register: () => () => Promise.resolve() })
  // Web-app style extra sections the catalog knows.
  ctx.systemPrompt.section({ name: 'harness:source', order: -99, text: 'The checkout is at /src.' })
  ctx.systemPrompt.section({ name: 'ui:deliverable-file-references', order: 190, text: 'Mention primary outputs.' })
  ctx.systemPrompt.section({ name: 'tool:bash', order: 105, text: 'Run shell commands.' })

  const editorFiber = await ctx.plugin({ apply, Config, inject, name }, { order: 200 })
  const scope = ctx.settings

  // Baseline: stock assembly, byte-identical to a deployment without this plugin's overrides.
  const baseline = await ctx.systemPrompt.assemble()
  assert.deepEqual(baseline.sections.map(s => s.name), [
    'harness:identity',
    'harness:source',
    'deployment:persona',
    'tool:bash',
    'ui:deliverable-file-references',
    'user:system-prompt-editor',
  ])
  assert.equal(renderPrompt(baseline), [
    'You are an AI agent powered by DeepSeek Harness.',
    'The checkout is at /src.',
    'You work at Acme.',
    'Run shell commands.',
    'Mention primary outputs.',
  ].join('\n\n'))

  // Persist a per-section override and an identity override; the NEXT assembly
  // reflects it with no re-registration (the listener reads the scope at call time).
  await scope.update('system-prompt-editor', {
    sections: {
      'harness:identity': 'Custom identity.',
      'harness:source': 'Custom source.',
    },
  })
  const after = await ctx.systemPrompt.assemble()
  assert.deepEqual(after.sections.map(s => [s.name, s.text]), [
    ['harness:identity', 'Custom identity.'],
    ['harness:source', 'Custom source.'],
    ['deployment:persona', 'You work at Acme.'],
    ['tool:bash', 'Run shell commands.'],
    ['ui:deliverable-file-references', 'Mention primary outputs.'],
    ['user:system-prompt-editor', ''],
  ])

  // The custom-section provider stays current too.
  await scope.update('system-prompt-editor', { text: 'Custom tail.' })
  const withTail = await ctx.systemPrompt.assemble()
  assert.ok(withTail.sections.some(s => s.name === 'user:system-prompt-editor' && s.text === 'Custom tail.'))

  // The preview assembles under the DEFAULT preset's standing composition.
  // The section a preset composition contributes is registered through the real
  // scoped registry here, so the preview reads exactly what a session joined to
  // that composition reads; the roster that names it is the plugin's own
  // contract with `dsh-agent-presets` and is a test double, because composing
  // a real preset is that package's own coverage and not this check's subject.
  const presetKey = { agentPreset: 'standard' }
  const component = createScope(ctx, presetKey)
  let componentRow
  let failing = false
  ctx.provide('agentPresets', {
    standingKeyFor: async id => {
      assert.equal(id, undefined, 'the preview asks for the roster default preset')
      if (failing) throw new Error('no such preset')
      return presetKey
    },
    presetIdOf: candidate => candidate === presetKey ? 'standard' : undefined,
  })
  try {
    // A preset row would be a tool plugin there; this is the same registration
    // that plugin makes, `inject` declaration included.
    const compose = (promptCtx) => {
      promptCtx.systemPrompt.section({ name: 'tool:component', order: 106, text: 'Composed tool guidance.' })
    }
    componentRow = await component.ctx.plugin({ inject: ['systemPrompt'], apply: compose })
    const preview = await ctx.get('systemPromptEditorPreview').preview({ text: '', persona: '', toolGuidance: '', sections: {} })
    assert.equal(preview.error, undefined)
    assert.deepEqual(preview.scope, { presetId: 'standard' }, 'the preview reports the preset it assembled under')
    const composed = preview.sections.find(s => s.name === 'tool:component')
    assert.equal(composed?.text, 'Composed tool guidance.', 'the composed tool guidance reaches the preview')
    assert.ok(preview.rendered.includes('Composed tool guidance.'), 'and the full rendered prompt')
    assert.deepEqual(preview.effective, { text: 'Custom tail.', persona: '', toolGuidance: '', sections: {
      'harness:identity': 'Custom identity.',
      'harness:source': 'Custom source.',
    } })

    // A roster whose default preset cannot compose is reported, never hidden:
    // the fallback is the scope-less assembly, which still carries the stored
    // overrides through the waterfall, and the next preview recovers once the
    // roster answers again.
    failing = true
    const fallback = await ctx.get('systemPromptEditorPreview').preview({ text: '', persona: '', toolGuidance: '', sections: {} })
    assert.deepEqual(fallback.scope, { fallback: 'unavailable', reason: 'no such preset' })
    assert.ok(!fallback.sections.some(s => s.name === 'tool:component'), 'the fallback cannot see the preset rows')
    assert.equal(fallback.sections.find(s => s.name === 'harness:identity')?.text, 'Custom identity.')
    assert.equal(renderPrompt(await ctx.systemPrompt.assemble()), renderPrompt(withTail), 'the fallback is the scope-less assembly')
    failing = false
    const recovered = await ctx.get('systemPromptEditorPreview').preview({ text: '', persona: '', toolGuidance: '', sections: {} })
    assert.deepEqual(recovered.scope, { presetId: 'standard' }, 'the preview recovers once the preset composes')
    assert.equal(recovered.sections.find(s => s.name === 'tool:component')?.text, 'Composed tool guidance.')
  } finally {
    await componentRow?.dispose()
    component.rawDispose()
  }

  // Clearing the map restores the deployment text byte-for-byte. `replace` is
  // the wholesale reset — a deep-merge `update({sections:{}})` cannot delete
  // keys it never sees, exactly like the client-side unset path uses.
  await scope.replace('system-prompt-editor', { text: '', persona: '', toolGuidance: '', sections: {} })
  const cleared = await ctx.systemPrompt.assemble()
  assert.equal(renderPrompt(cleared), renderPrompt(baseline))

  // The document persisted through the real file provider.
  const document = await readFile(settingsPath, 'utf8')
  assert.match(document, /system-prompt-editor:/)

  console.log('integration-real: all assertions passed')

  disposed = true
  await editorFiber.dispose()
  await promptFiber.dispose()
  await settingsFiber.dispose()
} finally {
  if (!disposed) ctx.stop?.()
  await rm(dir, { recursive: true, force: true })
}
