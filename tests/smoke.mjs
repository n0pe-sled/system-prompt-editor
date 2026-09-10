/**
 * Host-half smoke check for dsh-system-prompt-editor (no test framework):
 * stubs the injected services, calls apply(), and asserts the section
 * registration, the always-current provider behavior, the stored-override
 * waterfall listener (persona, tool band, and the generic per-section map),
 * and the preview receiver (full-prompt rendering with drafts applied).
 *
 * Run with: node tests/smoke.mjs (after `pnpm build`; imports lib/index.js)
 */

import assert from 'node:assert/strict'
import { apply, Config, inject, name, applyOverrides } from '../lib/index.js'

/** Stored user document, mutated by the fake provider's update(). */
let storedText = ''
let storedPersona = ''
let storedToolGuidance = ''
let storedSections = {}

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
    // The schema defaults all fields, including the generic section map.
    assert.deepEqual(schema({}), { text: '', persona: '', toolGuidance: '', sections: {} })
    return {
      get: () => ({ text: storedText, persona: storedPersona, toolGuidance: storedToolGuidance, sections: storedSections }),
      watch: () => () => {},
      update: (_ns, patch) => {
        if (patch.text !== undefined) storedText = String(patch.text)
        if (patch.persona !== undefined) storedPersona = String(patch.persona)
        if (patch.toolGuidance !== undefined) storedToolGuidance = String(patch.toolGuidance)
        if (patch.sections !== undefined) storedSections = { ...patch.sections }
      },
    }
  },
}

const fakeSystemPrompt = {
  section(section) { calls.sections.push(section) },
  async assemble() {
    // A realistic global assembly: identity, source, persona, two tool
    // sections, the deliverables note, and the plugin's custom section, with
    // the loop's global variable providers.
    return {
      sections: [
        { name: 'harness:identity', text: 'You are an AI agent powered by DeepSeek Harness.' },
        { name: 'harness:source', text: 'The DeepSeek Harness implementation checkout is at /src.' },
        { name: 'deployment:persona', text: 'You work at Acme.' },
        { name: 'tool:bash', text: 'Run shell commands.' },
        { name: 'tool:read', text: 'Read files.' },
        { name: 'ui:deliverable-file-references', text: 'Mention primary outputs.' },
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

/** Optional soft services the receiver looks up via ctx.get (e.g. the default model). */
const serviceStubs = {}

const ctx = {
  settings: fakeSettings,
  systemPrompt: fakeSystemPrompt,
  typert: fakeTypert,
  provide(key, value) { calls.provided.push([key, value]) },
  get(key) { return serviceStubs[key] },
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

// Helper: run the registered listener as the waterfall would.
const seen = []
const runListener = (assembly) => {
  const chain = Promise.resolve(calls.listener(assembly, {}, () => Promise.resolve(assembly)))
  // The listener must return the (mutated) assembly — the waterfall value is authoritative.
  return chain.then(result => { seen.push(result); return result })
}

// Persona override: non-empty stored persona replaces the deployment persona.
storedPersona = 'You are a terse assistant.'
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

// Generic section map: replaces an existing section, inserts an absent one at
// its canonical order, and leaves the rest alone.
storedToolGuidance = ''
storedSections = {
  'harness:identity': 'Custom identity text.',
  'harness:source': 'Custom source line.',
}
await runListener({
  sections: [
    { name: 'harness:identity', text: 'i' },
    { name: 'deployment:persona', text: 'p' },
    { name: 'tool:bash', text: 'bash' },
  ],
})
assert.deepEqual(seen[2].sections.map(s => [s.name, s.text]), [
  ['harness:identity', 'Custom identity text.'],
  ['harness:source', 'Custom source line.'],
  ['deployment:persona', 'p'],
  ['tool:bash', 'bash'],
], 'sections map replaces and inserts at the catalog order')

// Empty overrides leave defaults untouched (lossless).
storedSections = {}
storedPersona = ''
storedToolGuidance = ''
await runListener({
  sections: [
    { name: 'deployment:persona', text: 'You work at Acme.' },
    { name: 'tool:bash', text: 'Run shell commands.' },
    { name: 'user:system-prompt-editor', text: 'c' },
  ],
})
assert.deepEqual(seen[3].sections, [
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
assert.throws(() => draftsCodec.parse({ text: 42, persona: '', toolGuidance: '', sections: {} }), /strings/)
assert.throws(() => draftsCodec.parse({ text: 't', persona: 'p', toolGuidance: 'g', sections: { 'tool:bash': 42 } }), /sections/)
assert.deepEqual(
  draftsCodec.parse({ text: 't', persona: 'p', toolGuidance: 'g', sections: { 'harness:identity': 'id' } }),
  { text: 't', persona: 'p', toolGuidance: 'g', sections: { 'harness:identity': 'id' } },
)

// Preview: drafts applied on top of the stored assembly, full prompt rendered,
// per-section bands and orders annotated.
storedText = 'stored custom'
storedPersona = ''
storedToolGuidance = ''
storedSections = {}
const result = await receiver.preview({
  text: 'draft custom',
  persona: 'draft persona',
  toolGuidance: 'draft tool guidance',
  sections: {
    'harness:identity': 'draft identity',
    'harness:source': 'draft source',
    'ui:deliverable-file-references': 'draft deliverables',
  },
})
assert.equal(result.rendered, [
  'draft identity',
  'draft source',
  'draft persona',
  'draft tool guidance',
  'draft deliverables',
  'draft custom',
].join('\n\n'))
assert.equal(result.error, undefined)
assert.deepEqual(result.sections.map(s => [s.band, s.name]), [
  ['identity', 'harness:identity'],
  ['source', 'harness:source'],
  ['persona', 'deployment:persona'],
  ['tool-guidance', 'user:tool-guidance'],
  ['deliverables', 'ui:deliverable-file-references'],
  ['custom', 'user:system-prompt-editor'],
])
assert.equal(result.sections.find(s => s.band === 'identity').order, -100)
assert.equal(result.sections.find(s => s.band === 'source').order, -99)
assert.equal(result.sections.find(s => s.band === 'persona').order, 0)
assert.equal(result.sections.find(s => s.band === 'tool-guidance').order, 150)
assert.equal(result.sections.find(s => s.band === 'deliverables').order, 190)
assert.equal(result.sections.find(s => s.band === 'custom').order, 200)
assert.deepEqual(result.effective, { text: 'stored custom', persona: '', toolGuidance: '', sections: {} })

// Sections absent from a scope-less assembly are inserted at catalog order.
const inserted = await receiver.preview({
  text: '',
  persona: '',
  toolGuidance: '',
  sections: { 'context:file-reference': 'Draft file note.' },
})
const insertedNames = inserted.sections.map(s => s.name)
const fileIndex = insertedNames.indexOf('context:file-reference')
assert.ok(fileIndex >= 0, 'the absent file-reference section is inserted')
assert.ok(fileIndex < insertedNames.indexOf('tool:bash'), 'file-reference (order 99) inserts before the tool band (100+)')
assert.equal(inserted.sections[fileIndex].band, 'file-reference')
assert.equal(inserted.sections[fileIndex].order, 99)

// Tool guidance loads from the snapshot: per-agent tool sections are absent
// from the scope-less assembly, but the earlier runListener calls snapshotted
// the real band, so the preview replays it in-band.
const toolPreview = await receiver.preview({ text: '', persona: '', toolGuidance: '', sections: {} })
const toolNames = toolPreview.sections.map(s => s.name)
assert.ok(toolNames.includes('tool:bash') && toolNames.includes('tool:read'), 'snapshotted tool guidance is replayed')
assert.ok(toolNames.indexOf('tool:bash') < toolNames.indexOf('ui:deliverable-file-references'), 'tool band replays before deliverables')
assert.equal(toolPreview.error, undefined)
assert.ok(toolPreview.rendered.includes('Run shell commands.'))
assert.equal(toolPreview.sections.find(s => s.name === 'tool:bash').band, 'tool-guidance')

// Preview is lenient: with the real default-model service present, {{model}}
// and {{provider}} resolve; scope-less unknowns like {{cwd}} render literally
// instead of failing (a stock web persona references both {{model}}/{{cwd}}).
serviceStubs['agentDefaultModel'] = {
  currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4-flash-vision-exp' }),
}
fakeSystemPrompt.variablesOverride = { model: undefined, cwd: undefined, provider: undefined }
const originalAssemble = fakeSystemPrompt.assemble
fakeSystemPrompt.assemble = async () => ({
  ...(await originalAssemble()),
  sections: [
    ...(await originalAssemble()).sections,
    { name: 'tool:extra', text: 'Uses {{cwd}} and {{model}}.' },
  ],
})
const lenient = await receiver.preview({ text: '', persona: '', toolGuidance: '', sections: {} })
assert.equal(lenient.error, undefined)
assert.ok(lenient.rendered.includes('Uses {{cwd}} and deepseek-v4-flash-vision-exp.'))
assert.ok(lenient.sections.some(s => s.name === 'tool:extra'))

// Without the default-model service, unresolved references still render literally.
delete serviceStubs['agentDefaultModel']
const noStub = await receiver.preview({ text: '', persona: '', toolGuidance: '', sections: {} })
assert.equal(noStub.error, undefined)
assert.ok(noStub.rendered.includes('Uses {{cwd}} and {{model}}.'))
fakeSystemPrompt.assemble = originalAssemble

// applyOverrides: no tool sections present → the replacement is appended;
// absent sections with no known order append at the end.
const bare = { sections: [{ name: 'deployment:persona', text: 'p' }] }
applyOverrides(bare, { toolGuidance: 'g', text: 'c' })
assert.deepEqual(bare.sections.map(s => [s.name, s.text]), [
  ['deployment:persona', 'p'],
  ['user:tool-guidance', 'g'],
  ['user:system-prompt-editor', 'c'],
])
applyOverrides(bare, { sections: { 'third-party:note': 'hello' } }, { orderOf: () => undefined })
assert.deepEqual(bare.sections.map(s => [s.name, s.text]), [
  ['deployment:persona', 'p'],
  ['user:tool-guidance', 'g'],
  ['user:system-prompt-editor', 'c'],
  ['third-party:note', 'hello'],
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
