/**
 * Host-half smoke check for dsh-system-prompt-editor (no test framework):
 * stubs the injected services, calls apply(), and asserts the section
 * registration, the always-current provider behavior, the stored-override
 * waterfall listener, and the preview receiver (full-prompt rendering with
 * drafts applied).
 *
 * Run with: node tests/smoke.mjs (after `pnpm build`; imports lib/index.js)
 */

import assert from 'node:assert/strict'
import { apply, Config, inject, name, applyOverrides } from '../lib/index.js'

/** Stored user document, mutated by the fake provider's update(). */
let storedText = ''
let storedPersona = ''
let storedToolGuidance = ''

/** Captured calls during apply(). */
const calls = {
  sections: [],
  contribution: null,
  receiver: null,
  listener: null,
  provided: [],
}

const fakeSettings = {
  register(ns, schema) {
    assert.equal(ns, 'system-prompt-editor')
    assert.equal(typeof schema, 'function') // the schemastery schema is callable
    // The schema defaults all three fields.
    assert.deepEqual(schema({}), { text: '', persona: '', toolGuidance: '' })
    return {
      get: () => ({ text: storedText, persona: storedPersona, toolGuidance: storedToolGuidance }),
      watch: () => () => {},
      update: (_ns, patch) => {
        if (patch.text !== undefined) storedText = String(patch.text)
        if (patch.persona !== undefined) storedPersona = String(patch.persona)
        if (patch.toolGuidance !== undefined) storedToolGuidance = String(patch.toolGuidance)
      },
    }
  },
}

const fakeSystemPrompt = {
  section(section) { calls.sections.push(section) },
  async assemble() {
    // A realistic global assembly: identity, persona, two tool sections, and
    // the plugin's custom section, with the loop's global variable providers.
    return {
      sections: [
        { name: 'harness:identity', text: 'You are an AI agent powered by DeepSeek Harness.' },
        { name: 'deployment:persona', text: 'You work at Acme.' },
        { name: 'tool:bash', text: 'Run shell commands.' },
        { name: 'tool:read', text: 'Read files.' },
        { name: 'user:system-prompt-editor', text: storedText },
      ],
      contexts: [],
      tools: [],
      variables: {
        model: undefined,
        cwd: undefined,
        provider: undefined,
      },
    }
  },
}

const fakeTypert = {
  register(contribution) { calls.contribution = contribution; return () => Promise.resolve() },
}

const ctx = {
  settings: fakeSettings,
  systemPrompt: fakeSystemPrompt,
  typert: fakeTypert,
  provide(key, value) { calls.provided.push([key, value]) },
  on(event, listener) {
    assert.equal(event, 'system-prompt/assemble')
    calls.listener = listener
  },
}

// Static plugin metadata.
assert.equal(name, 'system-prompt-editor')
assert.deepEqual(inject, ['settings', 'systemPrompt', 'typert'])
assert.equal(typeof Config, 'function') // the schemastery schema is callable
assert.equal(typeof apply, 'function')

// Apply with an explicit order; the default is 200 but the config must flow.
apply(ctx, { order: 200 })

// One custom section, provider-evaluated per assembly.
assert.equal(calls.sections.length, 1, 'exactly one section is registered')
const [section] = calls.sections
assert.equal(section.name, 'user:system-prompt-editor')
assert.equal(section.order, 200)
assert.equal(typeof section.text, 'function', 'text is a provider evaluated per assembly')

// The provider reflects the stored text at call time — one registration, always current.
storedText = 'Be concise and cite sources.'
assert.equal(section.text({}), 'Be concise and cite sources.')
storedText = ''

// The stored-override listener is registered.
assert.equal(typeof calls.listener, 'function', 'the assemble listener is registered')

// Persona override: non-empty stored persona replaces the deployment persona.
storedPersona = 'You are a terse assistant.'
const next = async (assembly) => assembly
const seen = []
const runListener = (assembly) => {
  const chain = Promise.resolve(calls.listener(assembly, {}, () => Promise.resolve(assembly)))
  // The listener must return the (mutated) assembly — the waterfall value is authoritative.
  return chain.then(result => { seen.push(result); return result })
}

await runListener({
  sections: [
    { name: 'deployment:persona', text: 'You work at Acme.' },
    { name: 'tool:bash', text: 'Run shell commands.' },
    { name: 'user:system-prompt-editor', text: storedText },
  ],
})
assert.deepEqual(seen[0].sections.map(s => [s.name, s.text]), [
  ['deployment:persona', 'You are a terse assistant.'],
  ['tool:bash', 'Run shell commands.'],
  ['user:system-prompt-editor', ''],
], 'stored persona replaces the persona section')

// Tool guidance override: the tool band collapses into one replacement section.
storedPersona = ''
storedToolGuidance = 'Prefer reading over editing.'
await runListener({
  sections: [
    { name: 'harness:identity', text: 'i' },
    { name: 'deployment:persona', text: 'p' },
    { name: 'tool:bash', text: 'bash' },
    { name: 'tool:read', text: 'read' },
    { name: 'user:system-prompt-editor', text: 'c' },
  ],
})
assert.deepEqual(seen[1].sections.map(s => [s.name, s.text]), [
  ['harness:identity', 'i'],
  ['deployment:persona', 'p'],
  ['user:tool-guidance', 'Prefer reading over editing.'],
  ['user:system-prompt-editor', 'c'],
], 'tool band replaced in place, other sections untouched')

// Empty overrides leave defaults untouched (lossless).
storedPersona = ''
storedToolGuidance = ''
await runListener({
  sections: [
    { name: 'deployment:persona', text: 'You work at Acme.' },
    { name: 'tool:bash', text: 'Run shell commands.' },
    { name: 'user:system-prompt-editor', text: 'c' },
  ],
})
assert.deepEqual(seen[2].sections, [
  { name: 'deployment:persona', text: 'You work at Acme.' },
  { name: 'tool:bash', text: 'Run shell commands.' },
  { name: 'user:system-prompt-editor', text: 'c' },
], 'empty stored values leave the defaults untouched')

// The preview receiver is provided under the service key with a binding.
const provided = new Map(calls.provided)
const receiver = provided.get('systemPromptEditorPreview')
assert.ok(receiver, 'the receiver is provided')
assert.equal(receiver.typertRemote.service, receiver)
assert.equal(receiver.typertRemote.serviceKey, 'systemPromptEditorPreview')
assert.equal(receiver.typertRemote.namespace, 'systemPromptEditorPreview')

// The Typert contribution carries the preview invocation.
assert.equal(calls.contribution.package, 'dsh-system-prompt-editor')
assert.equal(calls.contribution.face, 'host')
assert.deepEqual(calls.contribution.schemas, [])
assert.deepEqual(calls.contribution.model, { services: [], events: [], objects: [] })
assert.equal(calls.contribution.invocations.length, 1)
const [invocation] = calls.contribution.invocations
assert.equal(invocation.id, 'dsh-system-prompt-editor#systemPromptEditorPreview.preview')
assert.equal(invocation.service, 'systemPromptEditorPreview')
assert.equal(invocation.namespace, 'systemPromptEditorPreview')
assert.equal(invocation.method, 'preview')
assert.deepEqual(invocation.invocation, { kind: 'direct' })
assert.equal(invocation.result.mode, 'strict')
assert.equal(invocation.parameters.length, 1)
assert.equal(invocation.parameters[0].name, 'drafts')
assert.equal(invocation.parameters[0].wire, 'drafts')
assert.equal(invocation.parameters[0].source, 'json')
assert.equal(invocation.parameters[0].codec.mode, 'strict')

// The drafts codec rejects malformed input and accepts well-formed drafts.
const draftsCodec = invocation.parameters[0].codec.schema
assert.throws(() => draftsCodec.parse({ text: 42, persona: '', toolGuidance: '' }), /strings/)
assert.deepEqual(
  draftsCodec.parse({ text: 't', persona: 'p', toolGuidance: 'g' }),
  { text: 't', persona: 'p', toolGuidance: 'g' },
)

// Preview: drafts applied on top of the stored assembly, full prompt rendered.
storedText = 'stored custom'
storedPersona = ''
storedToolGuidance = ''
const result = await receiver.preview({
  text: 'draft custom',
  persona: 'draft persona',
  toolGuidance: 'draft tool guidance',
})
assert.equal(result.rendered, [
  'You are an AI agent powered by DeepSeek Harness.',
  'draft persona',
  'draft tool guidance',
  'draft custom',
].join('\n\n'))
assert.equal(result.error, undefined)
assert.deepEqual(result.sections.map(s => [s.band, s.name]), [
  ['identity', 'harness:identity'],
  ['persona', 'deployment:persona'],
  ['tool-guidance', 'user:tool-guidance'],
  ['custom', 'user:system-prompt-editor'],
])
assert.equal(result.sections.find(s => s.band === 'persona').order, 0)
assert.equal(result.sections.find(s => s.band === 'tool-guidance').order, 150)
assert.equal(result.sections.find(s => s.band === 'custom').order, 200)
assert.deepEqual(result.effective, { text: 'stored custom', persona: '', toolGuidance: '' })

// Preview with an unresolved variable reports error instead of throwing.
fakeSystemPrompt.variablesOverride = { model: undefined, cwd: undefined, provider: undefined }
const originalAssemble = fakeSystemPrompt.assemble
fakeSystemPrompt.assemble = async () => ({
  ...(await originalAssemble()),
  sections: [
    ...(await originalAssemble()).sections,
    { name: 'tool:extra', text: 'Uses {{cwd}} and {{model}}.' },
  ],
})
const errored = await receiver.preview({ text: '', persona: '', toolGuidance: '' })
assert.equal(typeof errored.error, 'string')
assert.match(errored.error, /{{cwd}}/)
assert.equal(errored.rendered, '')
// The raw sections are still returned for display.
assert.ok(errored.sections.some(s => s.name === 'tool:extra'))
fakeSystemPrompt.assemble = originalAssemble

// applyOverrides: no tool sections present → the replacement is appended.
const bare = { sections: [{ name: 'deployment:persona', text: 'p' }] }
applyOverrides(bare, { toolGuidance: 'g', text: 'c' })
assert.deepEqual(bare.sections.map(s => [s.name, s.text]), [
  ['deployment:persona', 'p'],
  ['user:tool-guidance', 'g'],
  ['user:system-prompt-editor', 'c'],
])

// Default order when the config is omitted (the loader resolves the schema
// before calling apply, so the smoke test does the same).
calls.sections.length = 0
calls.listener = null
apply(ctx, Config({}))
assert.equal(calls.sections[0].order, 200)

// The schema default matches the documented band: 200 (after tool guidance).
const defaults = Config({})
assert.equal(defaults.order, 200)

console.log('smoke: all assertions passed')
