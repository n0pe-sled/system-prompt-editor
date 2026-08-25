# dsh-system-prompt-editor

A [dsh](https://github.com/deepseek-ai/deepseek-harness) plugin that edits the
**system prompt of every new session** on this machine from the Settings page.
Three fields feed the assembled prompt:

| Field | Band | Effect when non-empty |
|---|---|---|
| **Custom system prompt text** | order 200 | Appended verbatim after the persona and tool guidance. |
| **Persona** | order 0 | Replaces the deployment persona section. |
| **Tool guidance** | orders 100–199 | Replaces the per-tool guidance prose sections with one section. |

All sections are evaluated/applied at every assembly, so a save takes effect
on the very next request. No restart needed.

## The three actions (per field card)

| Action | Behavior |
|---|---|
| **Save** | Persists the draft into the `system-prompt-editor` settings namespace. Confirms with "Saved", or reports when the write did not land (host-side refusal / revision conflict) and keeps the draft so nothing is lost. |
| **Preview system prompt** | Shows the **entire assembled prompt** as the model would see it — harness identity, deployment sections, and this plugin's three fields, with the current drafts applied — annotated per band. Strict `{{variable}}` interpolation failures are reported instead of crashing. |
| **Load current system prompt** | Pulls the currently active stored value back into the editor, overwriting the draft. For persona/tool guidance with nothing stored, falls back to the *effective* deployment default captured from the last preview (the client cannot see the deployment defaults otherwise). |

While the settings scope is loading, the actions are disabled; in a remote
(non-loopback) browser the page shows a note that settings are process-local
and stays inert. Empty stored values leave the deployment defaults untouched,
so clearing a field restores the original prompt without the plugin ever
knowing what it was.

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
  is `$DSH_HOME/settings.yaml` (section `system-prompt-editor:` with three
  fields: `text:`, `persona:`, `toolGuidance:`). Saved text survives restarts
  and is shared by every profile on the machine.
- **Custom text contribution** — the plugin registers one section
  (`user:system-prompt-editor`) at configurable `order` (default **200**:
  after the deployment persona at 0 and tool guidance at 100–199). Empty text
  yields an empty section, which assembly drops — no custom text costs zero
  tokens. `{{name}}` variable references (e.g. `{{cwd}}`, `{{model}}`,
  `{{provider}}`) resolve at request time like any other section.
- **Persona/tool-guidance overrides** — a `system-prompt/assemble` waterfall
  listener (`src/shared/overrides.ts`, shared with the preview) replaces the
  `deployment:persona` text (order 0) and collapses the tool prose band
  (orders 100–199) into one `user:tool-guidance` section at order 150 when the
  stored values are non-empty. Tool *schemas* are never touched; empty stored
  values leave the defaults alone.
- **Preview endpoint** — a runtime-registered Typert invocation
  (`systemPromptEditorPreview/preview`) assembles the full prompt host-side
  (stored values flow through the waterfall), applies the drafts, renders, and
  returns `{ rendered, sections, effective }` plus an `error` when strict
  variable interpolation fails. The client mounts the same descriptor and
  unwraps the `RemoteResult`. The preview assembles without a specific agent,
  so per-agent presets may differ (noted in the UI caption).
- **Config** — `order: 200` in the plugin row config (profile
  `cordis.patch.yml` or a `--patch` overlay) moves the custom section; the
  schema default is 200.

## Verify

```sh
dsh --profile web --dump-config     # shows a "# == dsh-system-prompt-editor" layer
node tests/smoke.mjs                # host-half smoke check (needs `pnpm build` first)
```

Then open the web GUI → Settings → **System Prompt**: edit, Save, check
`$DSH_HOME/settings.yaml`, start a fresh session and ask the model about its
system prompt, or export the session log and inspect the model-visible
messages.

## Development

```sh
pnpm install          # devDependencies (cordis, schemastery, client type packages, tsdown, typescript, react)
pnpm typecheck        # tsc --noEmit
pnpm build            # tsdown: lib/index.js (node half) + lib/client.js (browser half)
node tests/smoke.mjs  # host-half smoke check against stubbed services
```

`prepare` also runs `tsdown`, so a git install builds itself (pnpm ≥ 10 asks
you to allowlist the build script in the profile's `pnpm-workspace.yaml`).
