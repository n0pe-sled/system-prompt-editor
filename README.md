# dsh-system-prompt-editor

A [dsh](https://github.com/deepseek-ai/deepseek-harness) plugin that edits the
**system prompt of every new session** on this machine from the Settings page.
Every stable section of the assembled prompt is editable — the harness
identity, the source-checkout line, the web-surface orientation, the persona,
the file-reference note, the tool-guidance prose band, the deliverables note,
and the custom tail — plus third-party sections discovered through a preview.

| Field | Band | Effect when non-empty |
|---|---|---|
| **Harness identity** | order −100 | Replaces the fixed identity opener. |
| **Source checkout** | order −99 | Replaces the harness source-checkout line. |
| **Web surface** | order −98 | Replaces the web-surface orientation section. |
| **Persona** | order 0 | Replaces the deployment persona section. |
| **File-reference note** | order 99 | Replaces the note about mentioning created/modified files. |
| **Tool guidance** | orders 100–199 | Replaces every per-tool guidance prose section with this one section. |
| **Deliverables note** | order 190 | Replaces the response-format note about mentioning primary outputs. |
| **Custom system prompt text** | order 200 | Appended verbatim after the persona and tool guidance. |

All overrides are evaluated/applied at every assembly, so a save takes effect
on the very next request. No restart needed.

Blue-banded sections in the preview — **Plan mode policy**, **Code-mode rule**, and
**Code SDK guidance** — are owned by DSH state or code-mode plugins and are
shown read-only ("Managed by DSH"): they are functions of agent state, and
overriding them would fight their owning plugins.

## The three actions (per field card)

| Action | Behavior |
|---|---|
| **Save** | Persists the draft into the `system-prompt-editor` settings namespace. Confirms with "Saved", or reports when the write did not land (host-side refusal / revision conflict) and keeps the draft so nothing is lost. |
| **Preview system prompt** | Shows the **entire assembled prompt** as the model would see it — every section, with the current drafts applied — annotated per band, with DSH-managed sections marked. The host assembles it **under the default preset's standing composition**, so the per-tool guidance and the other model-facing rows are the ones a new session reads rather than an empty band; a deployment that mounts no preset roster (or whose default preset cannot compose) assembles scope-less instead and the preview says which. `{{model}}`/`{{provider}}` resolve from the real default-model selection; references with no scope-less value (like `{{cwd}}`) render literally instead of erroring. Third-party sections seen in the preview become editable cards (generic per-section overrides). |
| **Load current system prompt** | Fetches that section's **current effective text** with a fresh host-side assembly (no drafts) and loads it into the editor — the stored override when one exists, otherwise the composed default — so the textarea holds what the model actually reads today, ready to edit and save. Saving the loaded default stores it as a fixed override; clearing back to empty restores the default. For **Tool guidance** this is how the shipped band is edited rather than overwritten: Load fills the box with every per-tool section the default preset composes, and saving the edited box replaces the whole band with it. |

While the settings scope is loading, the actions are disabled; in a remote
(non-loopback) browser the page shows a note that settings are process-local
and stays inert. Empty stored values leave the deployment defaults untouched,
so clearing a field restores the original prompt without the plugin ever
knowing what it was.

Each card collapses on its own header, and **Collapse all** / **Expand all** in
the toolbar toggles the whole page at once. A collapsed card keeps its title,
its order chip, and its **Unsaved** badge, and its hint says how many characters
the hidden draft holds, so a draft can never hide silently.

## Profiles (the toolbar at the top of the page)

The toolbar sits above every card because a profile belongs to the prompt, not
to one section. Two places hold text and the labels keep them apart: a
**profile** is the saved library, and the **editor boxes** are the live prompt
the next assembly reads.

| Action | Behavior |
|---|---|
| **Save all** | Writes every editor box into the selected profile, creating it or replacing it (with a confirmation). It does **not** change the live prompt. Pick **New profile…** to name a new one. |
| **Load all** | Applies the selected profile to the live prompt **and** fills every box with it, so one click switches what the model reads on the next message. |
| **Clear all** | Unsets every live override, restoring the shipping deployment prompt. Saved profiles survive it. |
| **Reload from live prompt** | Re-reads what the model would actually read right now into every box, discarding unapplied edits. Reads only; it writes nothing. |
| **New** | Reveals the name field for a profile **Save all** will create. |
| **Delete** | Removes the selected profile. The live prompt is unaffected. |

A profile carries the full editable prompt: the three fields plus the section
map, third-party sections discovered through a preview included. When a loaded
profile names a section this page has never discovered, the plugin grows a card
for it and says so, so a section restored to storage is never invisible to the
next **Save all**.

**Default** is the baseline a reset lands on. It is created empty on first use
and cannot be deleted: fill the boxes and **Save all** to redefine it, then
**Apply Default** puts it back. **Clear all** goes further, ignoring the Default
profile and restoring the shipping deployment prompt.

An empty box in a profile means "leave the deployment default alone", so a
profile with empty fields never pins a default out of the way. For the same
reason **Load all** *unsets* a field a profile leaves empty rather than storing
an empty string: a namespace that keeps empty keys around is a namespace that
looks like it refused a clear.

## Install

From the directory that contains `system-prompt-editor/`:

```sh
dsh plugin --profile web add ./system-prompt-editor
```

(First use of `dsh plugin` initializes the profile with
`@deepseek-ai/dsh-base`.) The bundle layer is appended because the manifest
declares `dsh.bundle`; the same patch row also puts the package on the web
client roster (`dsh.client.platform: "web"`), so the Settings page appears
without extra wiring. If `dsh` is not on your PATH, run the same command as
`pnpm dsh ...` from a dsh source checkout, or `node <dsh-install>/bin.js ...`.

The registry serves `lib/client.js`, not sources — rebuild **and restart the
host** after changing either half (the host half loads at boot):

```sh
pnpm build
# restart the web GUI: the host half of a running instance keeps its boot-time code
```

## How it works

- **Storage** — the `system-prompt-editor` namespace of the settings document,
  machine-global like every dsh setting. Under the shipped file provider this
  is `$DSH_HOME/settings.yaml` (section `system-prompt-editor:` with `text:`,
  `persona:`, `toolGuidance:`, a `sections:` map keyed by section name, e.g.
  `harness:identity: "..."`, and a `profiles:` map of named snapshots). Saved
  text survives restarts and is shared by every profile on the machine.
  Profiles live in the same document: there is no export/import path.
- **Section catalog** — `src/shared/catalog.ts` pins the editable/read-only
  section names, canonical orders, labels, and warnings of the dsh release
  this build targets; both halves bundle it. The UI renders one card per
  curated entry; the host uses it for band chips and for inserting a section
  that is absent from a given assembly at its canonical position.
- **Custom text contribution** — the plugin registers one section
  (`user:system-prompt-editor`) at configurable `order` (default **200**: after
  the deployment persona at 0 and tool guidance at 100–199). Empty text
  yields an empty section, which assembly drops — no custom text costs zero
  tokens. `{{name}}` variable references (e.g. `{{cwd}}`, `{{model}}`,
  `{{provider}}`) resolve at request time like any other section.
- **Overrides** — a `system-prompt/assemble` waterfall listener
  (`src/shared/overrides.ts`, shared with the preview) replaces the
  `deployment:persona` text (order 0), collapses the tool prose band
  (orders 100–199) into one `user:tool-guidance` section at order 150, and
  applies every non-empty `sections[name]` entry — replacing the assembled
  section of that name in place, or inserting it at its catalog order when
  absent. Tool *schemas* are never touched; empty stored values leave the
  defaults alone.
- **Preview endpoint** — a runtime-registered Typert invocation
  (`systemPromptEditorPreview/preview`) assembles the full prompt host-side
  (stored values flow through the waterfall), applies the drafts, and renders
  leniently (`{{model}}`/`{{provider}}` come from the real default-model
  selection; any other unresolved reference stays literal — a stock web
  persona references `{{model}}`/`{{cwd}}`, and `{{cwd}}` is only knowable
  per session), returning `{ rendered, sections, effective, scope }`. The client
  mounts the same descriptor and unwraps the `RemoteResult`.
- **Preview scope** — the preview reads the soft `agentPresets` service and
  assembles under `standingKeyFor()`, the standing composition of the roster's
  default preset: the one a new session composes. On the Web surface the
  model-facing rows — tools, their guidance sections, skill, todo — are preset
  rows rather than global ones, so a scope-less assembly reports an empty tool
  band; the standing scope is what makes Preview and Load report the guidance a
  session actually reads, and follow a composition edit with no session at all.
  The scope is composed without an agent, a session, or a turn, and nothing is
  assembled for a session that named another preset — the panel says which preset
  answered, and when the preset cannot be composed it reports that the preview
  fell back to the scope-less assembly (the `scope` field of the result) rather
  than presenting an incomplete prompt as the live one.
- **Config** — `order: 200` in the plugin row config (profile
  `cordis.patch.yml` or a `--patch` overlay) moves the custom section; the
  schema default is 200.

## Caveats

- **Model-visible ⟺ logged**: edits are model-visible input; the session log
  already records `request/header`, so the runtime-cached provider-prefix reuse
  is invalidated from the first changed token — inherent to the feature.
- **Machine-critical sections have warnings**: overriding `harness:identity`,
  `harness:source`, or `app:web-surface` removes orientation the harness
  depends on; the UI marks those cards accordingly, as it does for the
  file-reference note (which is what makes changed-file links clickable).
- **Version pinning**: section names/orders are internal dsh contracts, pinned
  to `dsh 0.1.1-rc.2` (see `src/shared/catalog.ts`); bump the pin and review
  the catalog when upgrading the harness. Newer dsh split the persona into
  prefix/suffix sections — the catalog recognizes those names for the persona
  band but does not add overrides for them. The preview reads the `agentPresets`
  service name and its `standingKeyFor()` method through `ctx.get`, so a harness
  that renames either one degrades the preview to the scope-less assembly rather
  than failing the page.
- **Preview reads the DEFAULT preset**: the preview shows what a new session
  composes when it names no preset. A session that chose another preset, or a
  child agent joined to its parent's composition, may read different guidance;
  the panel names the preset it assembled under so the difference is visible.

## Verify

```sh
dsh --profile web --dump-config     # shows a "# == dsh-system-prompt-editor" layer
node tests/smoke.mjs                # host-half smoke check (needs `pnpm build` first)
node tests/integration-real.mjs     # real providers (dsh-system-prompt + dsh-settings-file in a temp dir)
```

Then open the web GUI → Settings → **System Prompt**: edit, Save, check
`$DSH_HOME/settings.yaml` (the `sections:` map gains your keys), start a fresh
session and ask the model about its system prompt, or export the session log
and inspect the model-visible messages. Load current system prompt must
round-trip per field; clearing a field must restore the deployment default.
**Preview system prompt** must name the preset it assembled under and show the
per-tool guidance sections the new session reads; **Load** on the Tool guidance
card must fill the box with that same band, and Save must then replace the band
with the box's contents.
For the toolbar: **Save all** must add a key under `profiles:` and leave the
live fields alone, **Load all** must write the profile's values into the live
fields, **Clear all** must remove them while leaving `profiles:` intact, and a
**Delete** of `Default` must be refused. Collapsed state is per page visit; it
is not remembered across reloads.

## Development

```sh
pnpm install          # devDependencies (cordis, schemastery, client type packages, tsdown, typescript, react)
pnpm typecheck        # tsc --noEmit
pnpm build            # tsdown: lib/index.js (node half) + lib/client.js (browser half)
node tests/smoke.mjs  # host-half smoke check against stubbed services
```

`prepare` also runs `tsdown`, so a git install builds itself (pnpm ≥ 10 asks
you to allowlist the build script in the profile's `pnpm-workspace.yaml`).
