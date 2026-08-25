# Plan: persona + tool-guidance fields and a full-prompt preview

## 1. Objective

Extend the System Prompt Editor settings panel from one field (custom system
prompt text) to **three fields**, each carrying the same button trio (Save,
Preview system prompt, Load current system prompt):

1. **System prompt text** — the existing order-200 custom section (unchanged).
2. **Persona** — overrides the `deployment:persona` section (order 0) when non-empty.
3. **Tool guidance** — replaces the tool-guidance prose sections (orders 100–199, names `tool:*`) with the stored text when non-empty.

Additionally, the **Preview** button must show the **entire assembled system
prompt** (identity + persona + tool guidance + custom text, with variables
interpolated) — answering "is there really no system prompt being generated?"
(There is: it is assembled per request; the current preview only shows this
plugin's empty contribution.)

## 2. Current behavior

- Host (`src/index.ts`): settings namespace `system-prompt-editor` with one
  field `text`; one section `user:system-prompt-editor` (order 200) whose text
  provider reads the settings at every assembly.
- Client (`src/client/SystemPromptEditorPanel.tsx`): textarea + Save/Preview/
  Load buttons; Preview shows ONLY this plugin's contribution.
- The persona and tool guidance are owned by other packages and are invisible
  to this plugin's UI today.

## 3. Design overview

Three layers:

### 3a. Host-side overrides via the `system-prompt/assemble` waterfall

`ctx.on('system-prompt/assemble', ...)` listeners receive assemblies for ALL
scopes (subject-less listeners — proven by
`packages/preset/agent-presets/src/invariant.ts`, which inspects
`context.agent` on every assembly). The listener mutates `assembly.sections`:

- persona: find section named `deployment:persona`; if stored persona is
  non-empty, replace its text with the stored persona. Empty → leave default.
- tool guidance: if stored toolGuidance is non-empty, remove every section
  whose order is in [100, 199], insert one section
  `{ name: 'user:tool-guidance', order: 150, text: toolGuidance }`.
  Empty → leave defaults.
- The custom `text` section needs no handling (its provider is already
  always-current); the same helper is reused by the preview with drafts.

Shared helper: `applyOverrides(assembly, { persona?, toolGuidance?, text? })`
in a new module `src/shared/overrides.ts` so host listener and preview use one
implementation. The helper only touches the three bands; everything else
(identity, other plugins' sections, tool schemas) is untouched.

### 3b. Host→client bridge for the preview (no codegen)

A **runtime-registered Typert endpoint**, avoiding the generator pipeline:

- Host: in `apply`, register a plain receiver object at a service key, e.g.
  `ctx.provide('systemPromptEditorPreview', receiver)` where
  `receiver.typertRemote = bindTypertRemote(receiver, 'systemPromptEditorPreview', { namespace: 'systemPromptEditorPreview' })`
  and `receiver.preview(drafts)` assembles + applies + renders.
  Then `ctx.typert.register({ package: 'dsh-system-prompt-editor', face: 'host',
  schemas: [], model: { services: [], events: [], objects: [] },
  invocations: [previewDescriptor] })` with a hand-written
  `InvocationDescriptor` using `{ mode: 'src-json' }` codecs.
  The gateway claims `/api/systemPromptEditorPreview/preview` via
  `ctx.typert.local.get(endpoint)` and dispatches to the receiver —
  `validateBinding` only requires the `typertRemote` binding to be consistent.
  Add `'typert'` to the plugin inject list.
- Client: `await ctx.remote.$mount({ package, descriptors: [sameDescriptor] })`
  in `apply` (add `'remote'` to the client inject list), then the injected
  `preview(drafts)` callback calls
  `ctx.remote.systemPromptEditorPreview.preview(drafts)` and unwraps the
  `RemoteResult` (`{ ok: true, value }` / `{ ok: false, error }`).
- The shared descriptor lives in `src/shared/remote.ts` (bundled into both
  halves; it is pure JSON-safe data). No tsdown.config.ts changes needed —
  both halves already bundle own-source files.

### 3c. Preview response shape

```ts
interface SystemPromptPreviewResult {
  rendered: string   // full prompt as the model would see it, drafts applied
  // Per-section breakdown for annotated display:
  sections: { name: string; order: number; text: string }[]
  // Current effective values (stored, not draft) for the Load buttons:
  effective: { persona: string; toolGuidance: string; text: string }
  error?: string     // when strict variable interpolation fails
}
```

The preview endpoint runs `ctx.systemPrompt.assemble()` (stored overrides
apply via the waterfall), then applies DRAFT overrides on top (the same
`applyOverrides` helper), then `renderPrompt(assembly)` in a try/catch.
On render failure (e.g. an unresolved `{{variable}}` in a scope-less assembly),
return `error` instead of `rendered` and let the client surface it.

Note: runtime-context snapshots are user-role messages, not part of the
system prompt string; the preview covers sections only (`renderPrompt`).

## 4. Implementation steps

### Phase 1 — Host (src/index.ts, src/shared/overrides.ts)

- Extend the settings schema: `Schema.object({ text: Schema.string().default(''), persona: Schema.string().default(''), toolGuidance: Schema.string().default('') })` (keep the namespace name).
- Create `src/shared/overrides.ts` exporting
  `applyOverrides(assembly, overrides)` (persona + tool band logic above).
- Register the waterfall listener: mutate sections per stored settings
  (read `scope.get()` at each assembly — always current, no re-registration).
- Create the preview receiver object + `bindTypertRemote` binding, register
  the invocation via `ctx.typert.register(...)` (descriptor in
  `src/shared/remote.ts`), `inject: ['settings', 'systemPrompt', 'typert']`.

### Phase 2 — Shared wire contract (src/shared/remote.ts)

- `PREVIEW_DESCRIPTOR: InvocationDescriptor`:
  - id `dsh-system-prompt-editor#systemPromptEditorPreview.preview`
  - service `systemPromptEditorPreview`, namespace `systemPromptEditorPreview`
  - method `preview`, invocation `{ kind: 'direct' }`
  - parameter `{ name: 'drafts', wire: 'drafts', source: 'json', codec: { mode: 'src-json' } }`
  - result `{ mode: 'src-json' }`
- Types `SystemPromptDrafts`, `SystemPromptPreviewResult` (exported for both halves).

### Phase 3 — Client panel (src/client/SystemPromptEditorPanel.tsx, src/client/index.ts)

- Three field cards (reuse the existing card styles):
  1. Custom system prompt text (order 200)
  2. Persona (order 0)
  3. Tool guidance (orders 100–199)
- Each card: textarea + Save / Preview system prompt / Load current system
  prompt buttons; each Save writes only that field
  (`scope.set('text' | 'persona' | 'toolGuidance', draft)` with the existing
  read-back verification); each Load resets that draft from the stored value —
  and for persona/tool cards falls back to the current *effective* values from
  the preview response (the deployment defaults the client cannot see).
- Preview (any card's button): call the injected `preview({ text, persona,
  toolGuidance })` with ALL drafts → show `rendered` full prompt; annotate
  which band belongs to which card; show `error` inline when interpolation
  failed.
- `src/client/index.ts`: mount the remote contribution in `apply`
  (`await ctx.remote.$mount({ package: 'dsh-system-prompt-editor',
  descriptors: [PREVIEW_DESCRIPTOR] })`), inject `preview` alongside `save`,
  add `'remote'` to the client inject list.
- Draft-vs-stored semantics keep working per card (external-change hint,
  saved/not-applied/error outcomes).

### Phase 4 — Build & verify

- `pnpm typecheck`, `pnpm build` (both halves), `node tests/smoke.mjs` (extend
  it if feasible: host-only assertions on `applyOverrides` + assembly).
- Manual GUI pass on `127.0.0.1:3080`: three cards render; persona/tool text
  visible in a session's next request header; preview shows the full prompt
  including harness identity; Save → Load round-trip per field.
- Confirm the rebuilt client bundle reaches the GUI (client-plugin HMR or
  page refresh).

## 5. Edge cases & risks

- **Scope-less assembly variable resolution**: `{{model}}`/`{{cwd}}` are
  registered per agent by the loop; a bare `assemble()` may lack them and
  strict `renderPrompt` throws → preview catches and reports `error` instead
  of crashing. (Verify during implementation whether a scope-less assembly
  resolves them; if it does, no error path needed.)
- **Overrides must be lossless**: empty stored value ⇒ leave the default
  sections untouched; non-empty ⇒ replace. Never mutate tool *schemas* —
  only the guidance prose band (100–199).
- **Duplicate endpoint risk**: the descriptor id/namespace must not collide
  with existing remotes (verify `ctx.typert.local.list()` at runtime; the
  namespace name `systemPromptEditorPreview` is unique).
- **Receiver resolution**: verify `ctx.provide` + plain object resolves via
  the gateway's `receiverContext.get(service)`; fallback is a minimal Cordis
  `Service` subclass carrying the same `typertRemote` binding.
- **Client mount timing**: `$mount` is async — the preview callback must
  tolerate the mount not being ready (or the mount failing) by unwrapping the
  `RemoteResult` and surfacing `{ ok: false, error }` as a message instead of
  throwing.
- **Read-only settings**: the settings document can be read-only (per the
  existing `snapshot.writable` path) — Save stays disabled, but Preview and
  Load keep working; Load then shows the effective defaults.
- **Multi-scope preview fidelity**: the preview assembles scope-less, so an
  agent-scoped persona/section (agent presets) won't be reflected — document
  this in the UI caption ("preview approximates the default agent; per-agent
  presets may differ").
- **Waterfall listener order**: our listener must call `next()` and return
  the mutated assembly; other listeners (plan mode, code mode) compose fine
  because we only touch the three bands.

## 6. Out of scope (follow-ups)

- Editing tool *schemas* or per-tool guidance individually.
- Per-agent (scoped) persona overrides from this panel.
- Live diff highlighting between stored and draft in the preview.
- Showing runtime-context snapshots in the preview.
