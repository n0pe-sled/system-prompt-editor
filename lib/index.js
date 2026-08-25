import z from "@deepseek-ai/schemastery";
import { Context, Service } from "@deepseek-ai/cordis";
//#region node_modules/.pnpm/@deepseek-ai+dsh-scope@0.1.1-rc.2_@deepseek-ai+cordis@4.0.1_@deepseek-ai+dsh-invariants_7f15c7653b2619acc206cea5c06e49b3/node_modules/@deepseek-ai/dsh-scope/lib/index.js
/**
* Shared insertion-ordered storage and effect ownership for scope-aware registries.
*
* @module @deepseek-ai/dsh-scope
*/
/**
* Insertion-ordered named entries with caller-owned duplicate diagnostics.
*
* Values are borrowed. Iterators are live within one nonempty table
* generation; draining the table detaches them from later insertions. Each
* successful insertion returns an idempotent undo for that exact entry.
*/
var NamedEntries = class {
	duplicateError;
	data = /* @__PURE__ */ new Map();
	constructor(duplicateError) {
		this.duplicateError = duplicateError;
	}
	/**
	* Insert one unique name.
	* @param name - name unique within this table.
	* @param value - borrowed value to retain.
	* @returns an idempotent undo that removes only this insertion.
	*/
	insert(name, value) {
		const data = this.data;
		if (data.has(name)) throw this.duplicateError(name);
		data.set(name, value);
		let active = true;
		return () => {
			if (!active) return;
			active = false;
			data.delete(name);
			if (data.size === 0 && this.data === data) this.data = /* @__PURE__ */ new Map();
		};
	}
	/**
	* Read one named value.
	* @param name - name to resolve.
	* @returns the retained value, or `undefined` when absent.
	*/
	get(name) {
		return this.data.get(name);
	}
	/**
	* Test one name for membership.
	* @param name - name to test.
	* @returns whether the table contains that name.
	*/
	has(name) {
		return this.data.has(name);
	}
	/**
	* Iterate live names in insertion order.
	* @returns the native live key iterator.
	*/
	keys() {
		return this.data.keys();
	}
	/**
	* Iterate live entries in insertion order.
	* @returns the native live entry iterator.
	*/
	entries() {
		return this.data.entries();
	}
	/**
	* Iterate live values in insertion order.
	* @returns the native live value iterator.
	*/
	values() {
		return this.data.values();
	}
	/**
	* Test whether this table has no entries.
	* @returns whether the table is empty.
	*/
	isEmpty() {
		return this.data.size === 0;
	}
};
/**
* Insertion-ordered anonymous entries with independent registration identity.
*
* Equal values remain separate registrations. Values are borrowed, and
* iterators are live within one nonempty table generation; draining the table
* detaches them from later appends.
*/
var AnonymousEntries = class {
	data = /* @__PURE__ */ new Map();
	/**
	* Append one independently owned value.
	* @param value - borrowed value to retain.
	* @returns an idempotent undo for this exact append.
	*/
	append(value) {
		const data = this.data;
		const key = Symbol();
		data.set(key, value);
		let active = true;
		return () => {
			if (!active) return;
			active = false;
			data.delete(key);
			if (data.size === 0 && this.data === data) this.data = /* @__PURE__ */ new Map();
		};
	}
	/**
	* Iterate live values in insertion order.
	* @returns the native live value iterator.
	*/
	values() {
		return this.data.values();
	}
	/**
	* Test whether this table has no entries.
	* @returns whether the table is empty.
	*/
	isEmpty() {
		return this.data.size === 0;
	}
};
/**
* Own the global and exact-scope layers for one registry.
*
* Reads never create scoped layers. Registrations derive both visibility and
* effect ownership from the supplied Cordis context, collect undo before
* notification, and reclaim only a completely empty aggregate layer.
*/
var ScopedLayers = class {
	createLayer;
	onChange;
	/** The eagerly constructed context-global layer. */
	global;
	scoped = /* @__PURE__ */ new Map();
	constructor(createLayer, onChange) {
		this.createLayer = createLayer;
		this.onChange = onChange;
		this.global = createLayer(void 0);
	}
	/**
	* Read an existing exact-scope overlay. Deliberately chain-blind: callers
	* addressing one scope's OWN contributions (its restrictions, its guards)
	* must not silently pick up an ancestor's — use {@link chainLayers} where
	* inheritance is the point.
	* @param scope - exact scope key; `undefined` denotes no overlay.
	* @returns the existing scoped layer, or `undefined` without creating one.
	*/
	peek(scope) {
		if (scope === void 0) return void 0;
		return this.scoped.get(scope);
	}
	/**
	* Existing overlays along the scope's parent chain ({@link scopeChainOf}),
	* farthest ancestor first and the exact scope last, so a caller layering
	* them in order gives the nearest scope the final word.
	* @param scope - viewing scope, or `undefined` for no overlays.
	* @returns the existing layers, nearest last; absent overlays are skipped.
	*/
	chainLayers(scope) {
		const layers = [];
		for (const key of scopeChainOf(scope).reverse()) {
			const layer = this.scoped.get(key);
			if (layer !== void 0) layers.push(layer);
		}
		return layers;
	}
	/**
	* Materialize global named entries followed by scope-chain shadows,
	* farthest ancestor first, so the nearest scope's entry wins a name.
	* @param scope - viewing scope, or `undefined` for the global view.
	* @param pick - select the named table from a layer.
	* @returns an insertion-ordered effective map.
	*/
	merge(scope, pick) {
		const merged = new Map(pick(this.global).entries());
		for (const layer of this.chainLayers(scope)) for (const [name, value] of pick(layer).entries()) merged.set(name, value);
		return merged;
	}
	/**
	* Attach one synchronous layer mutation to its registration context.
	* @param ctx - context that determines both scope visibility and effect ownership.
	* @param action - atomic mutation returning its synchronous undo.
	* @param options - Cordis effect label and optional change notification.
	* @returns the exact disposer returned by `ctx.effect()`.
	*/
	effect(ctx, action, options) {
		const scope = scopeOf(ctx);
		const notify = options.notify ?? true;
		return ctx.effect(function* () {
			let layer;
			let created = false;
			if (scope === void 0) layer = this.global;
			else {
				const existing = this.scoped.get(scope);
				if (existing === void 0) {
					layer = this.createLayer(scope);
					this.scoped.set(scope, layer);
					created = true;
				} else layer = existing;
			}
			let undo;
			try {
				undo = action(layer);
			} catch (error) {
				if (scope !== void 0 && created && layer.isEmpty()) this.scoped.delete(scope);
				throw error;
			}
			yield () => {
				undo();
				if (scope !== void 0 && layer.isEmpty()) this.scoped.delete(scope);
				if (notify) this.onChange();
			};
			if (notify) this.onChange();
		}.bind(this), options.label);
	}
};
/**
* Scoped-context primitive: mint a Cordis context that tags registrations with
* an opaque identity and build routing-only event carriers for that identity.
*
* @module @deepseek-ai/dsh-scope
*/
/** Context tag written by {@link createScope}. */
const kScope = Symbol("dsh.scope");
/** The key associated with each carrier. Presence distinguishes an unkeyed carrier from a non-carrier. */
const carrierKeys = /* @__PURE__ */ new WeakMap();
/**
* The enclosing scope of each key. One relation powers both directions of
* scope nesting: registration views inherit DOWN the chain (a child scope
* sees its ancestors' layers — {@link ScopedLayers}), and event admission
* extends UP it (a listener tagged with an ancestor receives events dispatched
* to a descendant key — {@link scopeTarget}).
*/
const scopeParents = /* @__PURE__ */ new WeakMap();
/**
* The chain from a key to its root ancestor.
* @param key - the starting key, or `undefined` for the empty chain.
* @returns keys nearest-first: `[key, parent, grandparent, …]`.
*/
function scopeChainOf(key) {
	const chain = [];
	for (let cursor = key; cursor !== void 0; cursor = scopeParents.get(cursor)) chain.push(cursor);
	return chain;
}
/**
* Read the nearest scope tag inherited by a context.
* @param ctx - context to inspect.
* @returns its scope key, or `undefined` for an unscoped context.
*/
function scopeOf(ctx) {
	return ctx[kScope];
}
/**
* Build an opaque receiver that preserves the base filter, admits untagged
* listeners globally, and admits tagged listeners for a matching key or any
* of its ancestors ({@link bindScopeParent}): a listener owned by an enclosing
* scope receives every descendant scope's events, which is what lets one
* standing composition observe each of the agents composed under it. A tag
* BELOW the dispatch key stays excluded — events flow up the chain, never
* down.
* @param base - subject or service whose existing Cordis filter is preserved.
* @param key - routed scope identity, or `undefined` for an unscoped subject.
* @returns a carrier whose subject remains available only through event arguments.
*/
function scopeTarget(base, key) {
	const baseFilter = base[Context.filter];
	const carrier = { [Context.filter](ctx) {
		if (baseFilter !== void 0 && !baseFilter.call(base, ctx)) return false;
		const tag = scopeOf(ctx);
		if (tag === void 0) return true;
		for (let cursor = key; cursor !== void 0; cursor = scopeParents.get(cursor)) if (cursor === tag) return true;
		return false;
	} };
	carrierKeys.set(carrier, key);
	return carrier;
}
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-system-prompt@0.1.1-rc.2_@deepseek-ai+cordis@4.0.1_@deepseek-ai+dsh-in_8b3c61fdc6e580f4203fa0711b2dab74/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js
/**
* Registry for ordered system sections, dynamic context, tool schemas, and prompt variables.
*
* @module @deepseek-ai/dsh-system-prompt
*/
/**
* The deployment persona's section name and order. Exported because a
* composition can replace this slot — an agent preset shadows the
* deployment's persona with its own — and both sides naming the same section
* is what makes the replacement work rather than duplicate.
*/
const PERSONA_SECTION = "deployment:persona";
/** Valid variable names: how they are written between the braces. */
const VARIABLE_NAME = /^[a-z][a-z0-9_]*$/;
/** A complete `{{...}}` reference group at the scan position (validated after). */
const GROUP_AT = /^\{\{([^{}]*)\}\}/;
/** Reserved {@link Config.toolOrder} marker for unlisted tools. */
const TOOL_ORDER_REST = "<unlisted-tools>";
/**
* Validate duplicate names and the required {@link TOOL_ORDER_REST} marker.
* Registered names are checked later because plugins have not loaded yet.
*/
function validateToolOrder(toolOrder) {
	if (toolOrder === void 0) return void 0;
	const seen = /* @__PURE__ */ new Set();
	for (const name of toolOrder) {
		if (seen.has(name)) throw new Error(`toolOrder lists "${name}" more than once`);
		seen.add(name);
	}
	if (!seen.has("<unlisted-tools>")) throw new Error(`toolOrder must contain the "${TOOL_ORDER_REST}" rest entry (where unlisted tools are inserted)`);
	return toolOrder;
}
/**
* Apply configured tool order, inserting unlisted tools lexicographically at
* {@link TOOL_ORDER_REST}. Unknown configured names fail; known but restricted
* names may be absent.
*/
function orderTools(tools, toolOrder, knownNames) {
	if (tools.find((tool) => tool.name === "<unlisted-tools>") !== void 0) throw new Error(`tool provider returned reserved tool name "${TOOL_ORDER_REST}" (reserved for toolOrder's rest entry)`);
	if (toolOrder === void 0) return tools.sort(compareToolNames);
	const unknown = toolOrder.filter((name) => name !== "<unlisted-tools>" && !knownNames.has(name));
	if (unknown.length > 0) throw new Error(`toolOrder lists unregistered tool${unknown.length > 1 ? "s" : ""} ${unknown.map((name) => `"${name}"`).join(", ")}; known tools: ${[...knownNames].sort().join(", ") || "(none)"}`);
	const listed = new Set(toolOrder);
	const rest = tools.filter((tool) => !listed.has(tool.name)).sort(compareToolNames);
	return toolOrder.flatMap((name) => name === "<unlisted-tools>" ? rest : tools.filter((tool) => tool.name === name));
}
/** Lexicographic (code-unit) name comparison — locale-independent, so the order is identical on every machine. */
function compareToolNames(a, b) {
	return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}
/**
* Interpolate strict `{{variable}}` references, drop empty sections, and join
* the rest with blank lines. Malformed, unknown, or undefined references throw;
* a lone `{{` without any later `}}` is literal prose, and substituted values
* are not scanned again.
* @param assembly - the assembly whose sections and variables to render.
* @returns the rendered prompt, or `''` when all sections are empty.
*/
function renderPrompt(assembly) {
	return assembly.sections.map((section) => interpolate(section, assembly.variables, "section")).filter((text) => text.length > 0).join("\n\n");
}
/** Interpolate one section or context and attribute diagnostics to its owning input. */
function interpolate(input, variables, kind) {
	const text = input.text;
	let result = "";
	let last = 0;
	for (let open = text.indexOf("{{"); open >= 0; open = text.indexOf("{{", last)) {
		const group = GROUP_AT.exec(text.slice(open));
		if (group === null) {
			if (text.indexOf("}}", open + 2) >= 0) throw new Error(`malformed prompt variable reference at "${text.slice(open, open + 16)}…" in ${kind} "${input.name}" (references are complete simple {{name}} groups)`);
			result += text.slice(last, open + 2);
			last = open + 2;
			continue;
		}
		const name = group[0].slice(2, -2);
		if (!VARIABLE_NAME.test(name)) throw new Error(`malformed prompt variable reference "{{${name}}}" in ${kind} "${input.name}" (variable names match ${String(VARIABLE_NAME)})`);
		if (!Object.hasOwn(variables, name)) {
			const known = Object.keys(variables);
			throw new Error(`unknown prompt variable "{{${name}}}" in ${kind} "${input.name}"; registered variables: ${known.length > 0 ? known.join(", ") : "(none)"}`);
		}
		const value = variables[name];
		if (value === void 0) throw new Error(`prompt variable "{{${name}}}" has no value for this assembly (${kind} "${input.name}")`);
		result += text.slice(last, open) + value;
		last = open + group[0].length;
	}
	return result + text.slice(last);
}
/** All prompt registrations owned by one global or scoped layer. */
var PromptLayer = class {
	sections;
	contexts;
	runtimeContextSuppressors = new AnonymousEntries();
	toolProviders = new AnonymousEntries();
	variables;
	/**
	* Create one prompt layer with diagnostics specific to its ownership scope.
	* @param scope - the scoped owner, or `undefined` for global registrations.
	*/
	constructor(scope) {
		this.sections = new NamedEntries((name) => /* @__PURE__ */ new Error(scope === void 0 ? `prompt section "${name}" is already registered (for a per-agent override, register through that agent's \`agent.ctx\` instead)` : `prompt section "${name}" is already registered in this scope`));
		this.contexts = new NamedEntries((name) => /* @__PURE__ */ new Error(scope === void 0 ? `prompt context "${name}" is already registered (for a per-agent override, register through that agent's \`agent.ctx\` instead)` : `prompt context "${name}" is already registered in this scope`));
		this.variables = new NamedEntries((name) => /* @__PURE__ */ new Error(scope === void 0 ? `prompt variable "${name}" is already registered (for a per-agent value, register through that agent's \`agent.ctx\` instead)` : `prompt variable "${name}" is already registered in this scope`));
	}
	/** @returns whether this layer owns no prompt registrations. */
	isEmpty() {
		return this.sections.isEmpty() && this.contexts.isEmpty() && this.runtimeContextSuppressors.isEmpty() && this.toolProviders.isEmpty() && this.variables.isEmpty();
	}
};
/** Registry service for the prompt inputs assembled before each model step. */
var SystemPrompt = class extends Service {
	static Config = z.object({
		includeHarnessIdentity: z.boolean().default(true),
		includeRuntimeContext: z.boolean().default(true),
		persona: z.string().default(""),
		toolOrder: z.array(z.string()).default(void 0)
	});
	layers = new ScopedLayers((scope) => new PromptLayer(scope), () => {
		this.ctx.emit("system-prompt/change");
	});
	toolOrder;
	constructor(ctx, config) {
		super(ctx, "systemPrompt");
		this.toolOrder = validateToolOrder(config.toolOrder);
		if (config.includeHarnessIdentity ?? true) this.section({
			name: "harness:identity",
			order: -100,
			text: "You are an AI agent powered by DeepSeek Harness."
		});
		this.section({
			name: PERSONA_SECTION,
			order: 0,
			text: config.persona ?? ""
		});
		if (!(config.includeRuntimeContext ?? true)) this.suppressRuntimeContext();
	}
	/**
	* Register an ordered prompt section in the calling context's scope. A scoped
	* section shadows a global section with the same name; duplicates within one
	* layer and non-finite orders throw. Registration and disposal emit
	* `system-prompt/change`.
	* @param section - the section to register.
	* @returns the exact Cordis effect disposer.
	*/
	section(section) {
		if (!Number.isFinite(section.order)) throw new TypeError(`prompt section "${section.name}" order must be a finite number`);
		return this.layers.effect(this.ctx, (layer) => layer.sections.insert(section.name, section), { label: "systemPrompt.section()" });
	}
	/**
	* Register ordered dynamic context in the calling context's scope. Scoped
	* entries shadow global entries with the same name.
	* @param context - the context contribution to register.
	* @returns the exact Cordis effect disposer.
	*/
	context(context) {
		if (!Number.isFinite(context.order)) throw new TypeError(`prompt context "${context.name}" order must be a finite number`);
		return this.layers.effect(this.ctx, (layer) => layer.contexts.insert(context.name, context), { label: "systemPrompt.context()" });
	}
	/**
	* Suppress every dynamic runtime-context contribution in the calling
	* context's scope without changing the services that own or enforce those
	* facts. Multiple suppressors remain independently disposable.
	* @returns the exact Cordis effect disposer.
	*/
	suppressRuntimeContext() {
		return this.layers.effect(this.ctx, (layer) => layer.runtimeContextSuppressors.append(true), { label: "systemPrompt.suppressRuntimeContext()" });
	}
	/**
	* Register a tool-schema provider in the calling context's scope. Global and
	* matching scoped providers both contribute; returning the reserved
	* {@link TOOL_ORDER_REST} name makes assembly fail.
	* @param provider - evaluated for each assembly with its context.
	* @returns the exact Cordis effect disposer.
	*/
	tools(provider) {
		return this.layers.effect(this.ctx, (layer) => layer.toolProviders.append(provider), { label: "systemPrompt.tools()" });
	}
	/**
	* Register a prompt variable in the calling context's scope. Scoped values
	* shadow globals; invalid or duplicate names throw. A provider may return
	* `undefined`, but rendering a section that references that value then fails.
	* @param name - the `[a-z][a-z0-9_]*` reference name.
	* @param provider - evaluated for each assembly.
	* @returns the exact Cordis effect disposer.
	*/
	variable(name, provider) {
		if (!VARIABLE_NAME.test(name)) throw new Error(`invalid prompt variable name "${name}" (must match ${String(VARIABLE_NAME)})`);
		return this.layers.effect(this.ctx, (layer) => layer.variables.insert(name, provider), { label: "systemPrompt.variable()" });
	}
	/**
	* Assemble global and scoped providers, detach tool parameters, apply
	* canonical ordering, then run the assembly waterfall. Scoped sections and
	* variables shadow globals. The returned waterfall value is authoritative
	* except that an effective complete section is restored afterwards as the
	* sole prompt section.
	* @param context - the optional scope and plugin-defined assembly fields.
	* @returns the post-waterfall assembly with any complete prompt enforced.
	*/
	async assemble(context = {}) {
		const scope = context.scope;
		const scopeLayers = this.layers.chainLayers(scope);
		const runtimeContextSuppressed = !this.layers.global.runtimeContextSuppressors.isEmpty() || scopeLayers.some((layer) => !layer.runtimeContextSuppressors.isEmpty());
		const variables = {};
		for (const [name, provider] of this.layers.global.variables.entries()) variables[name] = provider(context);
		for (const layer of scopeLayers) for (const [name, provider] of layer.variables.entries()) variables[name] = provider(context);
		const sectionByName = this.layers.merge(scope, (layer) => layer.sections);
		const contextByName = this.layers.merge(scope, (layer) => layer.contexts);
		const providers = [...this.layers.global.toolProviders.values(), ...scopeLayers.flatMap((layer) => [...layer.toolProviders.values()])];
		const collected = [];
		const knownNames = /* @__PURE__ */ new Set();
		for (const provider of providers) {
			const result = provider(context);
			const schemas = result.schemas.map(({ name, description, parameters }) => ({
				name,
				description,
				parameters: structuredClone(parameters)
			}));
			const acceptedKnownNames = result.knownNames ?? schemas.map((tool) => tool.name);
			collected.push(...schemas);
			for (const name of acceptedKnownNames) knownNames.add(name);
		}
		const sectionDefinitions = [...sectionByName.values()].sort((a, b) => a.order - b.order);
		const completeSections = sectionDefinitions.filter((section) => section.complete === true);
		if (completeSections.length > 1) throw new Error(`multiple complete prompt sections are active: ${completeSections.map((section) => JSON.stringify(section.name)).join(", ")}`);
		let completeSection;
		const assembly = {
			sections: sectionDefinitions.map((section) => {
				const assembled = {
					name: section.name,
					text: typeof section.text === "function" ? section.text(context) : section.text
				};
				if (section.complete === true) completeSection = { ...assembled };
				return assembled;
			}),
			contexts: runtimeContextSuppressed ? [] : [...contextByName.values()].sort((a, b) => a.order - b.order).map((entry) => ({
				name: entry.name,
				text: typeof entry.text === "function" ? entry.text(context) : entry.text
			})),
			tools: orderTools(collected, this.toolOrder, knownNames),
			variables
		};
		const transformed = await this.ctx.waterfall(scopeTarget(this, scope), "system-prompt/assemble", assembly, context, () => Promise.resolve(assembly));
		if (completeSection === void 0 && !runtimeContextSuppressed) return transformed;
		return {
			...transformed,
			sections: completeSection === void 0 ? transformed.sections : [completeSection],
			contexts: runtimeContextSuppressed ? [] : transformed.contexts
		};
	}
};
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-typert-protocol@0.1.1-rc.2_@deepseek-ai+cordis@4.0.1_@deepseek-ai+dsh-_d8a93c1e0226dfbdafa801afa2319239/node_modules/@deepseek-ai/dsh-typert-protocol/lib/index.js
/**
* Remote decorators and explicit Gateway bindings backed only by private
* module state. Strict reflection remains a Typert compiler responsibility.
* @module @deepseek-ai/dsh-typert-protocol
*/
const TYPERT_REMOTE_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;
/**
* Test one generated Remote name against the Connection endpoint grammar.
* @param value - namespace, method, lookup, or Context segment.
* @returns whether the value can cross the shared RPC carrier unchanged.
*/
function isTypertRemoteSegment(value) {
	return value !== "." && value !== ".." && TYPERT_REMOTE_SEGMENT_PATTERN.test(value);
}
/**
* Bind one visible Service field to a Cordis key and Remote namespace.
* @param service - owning Service instance, normally `this`.
* @param serviceKey - exact Cordis service key.
* @param options - optional distinct wire namespace.
* @returns a frozen, inspectable binding with no compiler-injected metadata.
*/
function bindTypertRemote(service, serviceKey, options = {}) {
	validateName("service key", serviceKey);
	const namespace = options.namespace ?? serviceKey;
	validateName("namespace", namespace);
	return Object.freeze({
		service,
		serviceKey,
		namespace
	});
}
function validateName(subject, value) {
	if (!isTypertRemoteSegment(value)) throw new TypeError(`typert-protocol: ${subject} must contain only RPC endpoint segment characters`);
}
//#endregion
//#region src/shared/overrides.ts
/** Name of the single tool-guidance section this plugin inserts as a replacement. */
const TOOL_GUIDANCE_SECTION = "user:tool-guidance";
/** Registry-name convention of the per-tool guidance sections (orders 100–199). */
const TOOL_SECTION_PREFIX = "tool:";
/** The custom text section this plugin registers. */
const CUSTOM_SECTION = "user:system-prompt-editor";
/** Whether a section name belongs to the per-tool guidance band convention. */
function isToolSection(name) {
	return name.startsWith(TOOL_SECTION_PREFIX);
}
/**
* Apply non-empty overrides to an assembled prompt, in place.
* @param assembly - the assembled prompt to mutate.
* @param overrides - the overrides to apply; empty values leave defaults alone.
*/
function applyOverrides(assembly, overrides) {
	if (overrides.persona !== void 0 && overrides.persona !== "") {
		const slot = assembly.sections.find((section) => section.name === PERSONA_SECTION);
		if (slot !== void 0) slot.text = overrides.persona;
		else assembly.sections.push({
			name: PERSONA_SECTION,
			text: overrides.persona
		});
	}
	if (overrides.toolGuidance !== void 0 && overrides.toolGuidance !== "") {
		const existing = assembly.sections.find((section) => section.name === TOOL_GUIDANCE_SECTION);
		if (existing !== void 0) existing.text = overrides.toolGuidance;
		else {
			const firstToolIndex = assembly.sections.findIndex((section) => isToolSection(section.name));
			const replacement = {
				name: TOOL_GUIDANCE_SECTION,
				text: overrides.toolGuidance
			};
			if (firstToolIndex < 0) assembly.sections.push(replacement);
			else assembly.sections = [
				...assembly.sections.slice(0, firstToolIndex),
				replacement,
				...assembly.sections.slice(firstToolIndex).filter((section) => !isToolSection(section.name))
			];
		}
	}
	if (overrides.text !== void 0 && overrides.text !== "") {
		const slot = assembly.sections.find((section) => section.name === CUSTOM_SECTION);
		if (slot !== void 0) slot.text = overrides.text;
		else assembly.sections.push({
			name: CUSTOM_SECTION,
			text: overrides.text
		});
	}
}
//#endregion
//#region src/shared/remote.ts
/** Cordis service key of the preview receiver, also the wire namespace. */
const PREVIEW_SERVICE = "systemPromptEditorPreview";
/** Stable generated-style identity of the preview invocation. */
const PREVIEW_ID = `dsh-system-prompt-editor#${PREVIEW_SERVICE}.preview`;
/** Type symbol of the drafts boundary value (diagnostics only). */
const DRAFTS_TYPE = "dsh-system-prompt-editor#SystemPromptDrafts";
/** Type symbol of the preview result boundary value (diagnostics only). */
const RESULT_TYPE = "dsh-system-prompt-editor#SystemPromptPreviewResult";
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function isString(value) {
	return typeof value === "string";
}
/** The preview invocation, registered by the host and mounted by the client. */
const PREVIEW_DESCRIPTOR = {
	id: PREVIEW_ID,
	service: PREVIEW_SERVICE,
	namespace: PREVIEW_SERVICE,
	method: "preview",
	invocation: { kind: "direct" },
	parameters: [{
		name: "drafts",
		wire: "drafts",
		source: "json",
		codec: {
			mode: "strict",
			typeSymbol: DRAFTS_TYPE,
			schema: { parse(value) {
				if (!isRecord(value)) throw new TypeError("drafts must be a plain object");
				const { text, persona, toolGuidance } = value;
				if (!isString(text) || !isString(persona) || !isString(toolGuidance)) throw new TypeError("drafts.text, drafts.persona and drafts.toolGuidance must all be strings");
				return {
					text,
					persona,
					toolGuidance
				};
			} }
		}
	}],
	result: {
		mode: "strict",
		typeSymbol: RESULT_TYPE,
		schema: { parse(value) {
			if (!isRecord(value)) throw new TypeError("preview result must be a plain object");
			const { rendered, sections, effective, error } = value;
			if (!isString(rendered)) throw new TypeError("preview result rendered must be a string");
			if (!Array.isArray(sections)) throw new TypeError("preview result sections must be an array");
			if (!isRecord(effective)) throw new TypeError("preview result effective must be a plain object");
			const { text, persona, toolGuidance } = effective;
			if (!isString(text) || !isString(persona) || !isString(toolGuidance)) throw new TypeError("preview result effective fields must all be strings");
			const parsed = {
				rendered,
				sections: sections.map((entry, index) => {
					if (!isRecord(entry) || !isString(entry.name) || !isString(entry.text)) throw new TypeError(`preview result section ${String(index)} must have string name and text`);
					const band = entry.band;
					if (band !== "identity" && band !== "persona" && band !== "tool-guidance" && band !== "custom" && band !== "other") throw new TypeError(`preview result section ${String(index)} has an invalid band`);
					const order = entry.order;
					if (order !== void 0 && (typeof order !== "number" || !Number.isFinite(order))) throw new TypeError(`preview result section ${String(index)} has an invalid order`);
					const parsed = {
						name: entry.name,
						text: entry.text,
						band
					};
					return order === void 0 ? parsed : {
						...parsed,
						order
					};
				}),
				effective: {
					text,
					persona,
					toolGuidance
				}
			};
			if (error === void 0) return parsed;
			if (!isString(error)) throw new TypeError("preview result error must be a string");
			return {
				...parsed,
				error
			};
		} }
	}
};
//#endregion
//#region src/index.ts
/**
* Host (Node) half of the System Prompt Editor plugin.
*
* Registers the `system-prompt-editor` settings namespace (durable, per-machine
* storage through the settings provider — `$DSH_HOME/settings.yaml` under the
* shipped file provider) with three fields — custom text, persona, and tool
* guidance — and contributes to every system prompt assembly:
*
* - the custom text section (configurable `order`, default 200) whose text is
*   a provider evaluated at EVERY assembly, so a save changes the next
*   request's prompt with no re-registration, no restart, and no reload;
* - a `system-prompt/assemble` waterfall listener that applies the stored
*   persona and tool-guidance overrides via {@link applyOverrides} — the same
*   helper the preview endpoint reuses with drafts;
* - a runtime-registered Typert endpoint (`systemPromptEditorPreview/preview`)
*   that assembles the full prompt, applies draft overrides, renders it, and
*   returns the whole model-visible prompt plus a per-section breakdown.
*/
const name = "system-prompt-editor";
/** Services that must be mounted before this plugin runs. */
const inject = [
	"settings",
	"systemPrompt",
	"typert"
];
const Config = z.object({ order: z.number().default(200) });
const NAMESPACE = "system-prompt-editor";
const SECTION_NAME = "user:system-prompt-editor";
const IDENTITY_SECTION = "harness:identity";
/** Empty model for the Typert contribution: no generated reflection is claimed. */
const EMPTY_MODEL = {
	services: [],
	events: [],
	objects: []
};
/** The identity section's display order (registered by dsh-system-prompt at −100). */
const IDENTITY_ORDER = -100;
/** Classify one assembled section into the band the UI annotates. */
function bandOf(name, customSection) {
	if (name === IDENTITY_SECTION) return "identity";
	if (name === "deployment:persona") return "persona";
	if (name === "user:tool-guidance" || name.startsWith("tool:")) return "tool-guidance";
	if (name === customSection) return "custom";
	return "other";
}
/** The display order of one classified section, when this plugin knows it. */
function knownOrder(band, customOrder) {
	switch (band) {
		case "identity": return IDENTITY_ORDER;
		case "persona": return 0;
		case "tool-guidance": return 150;
		case "custom": return customOrder;
		case "other": return;
	}
}
function apply(ctx, config) {
	const sectionSchema = z.object({
		text: z.string().default(""),
		persona: z.string().default(""),
		toolGuidance: z.string().default("")
	});
	const scope = ctx.settings.register(NAMESPACE, sectionSchema);
	ctx.systemPrompt.section({
		name: SECTION_NAME,
		order: config.order,
		text: () => scope.get()?.text ?? ""
	});
	ctx.on("system-prompt/assemble", async (assembly, _context, next) => {
		const stored = scope.get();
		applyOverrides(assembly, {
			persona: stored?.persona,
			toolGuidance: stored?.toolGuidance
		});
		return next();
	});
	const receiver = {
		typertRemote: void 0,
		async preview(drafts) {
			const assembly = await ctx.systemPrompt.assemble();
			applyOverrides(assembly, drafts);
			const stored = scope.get();
			const effective = {
				text: stored?.text ?? "",
				persona: stored?.persona ?? "",
				toolGuidance: stored?.toolGuidance ?? ""
			};
			const sections = assembly.sections.map(({ name, text }) => {
				const band = bandOf(name, SECTION_NAME);
				const order = knownOrder(band, config.order);
				const section = {
					name,
					text,
					band
				};
				return order === void 0 ? section : {
					...section,
					order
				};
			});
			try {
				return {
					rendered: renderPrompt(assembly),
					sections,
					effective
				};
			} catch (error) {
				return {
					rendered: "",
					sections,
					effective,
					error: error instanceof Error ? error.message : String(error)
				};
			}
		}
	};
	receiver.typertRemote = bindTypertRemote(receiver, PREVIEW_SERVICE, { namespace: PREVIEW_SERVICE });
	ctx.provide(PREVIEW_SERVICE, receiver);
	const contribution = {
		package: "dsh-system-prompt-editor",
		face: "host",
		schemas: [],
		model: EMPTY_MODEL,
		invocations: [PREVIEW_DESCRIPTOR]
	};
	ctx.typert.register(contribution);
}
//#endregion
export { Config, apply, applyOverrides, inject, name };
