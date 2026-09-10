window.__ModuleLoader__.load({
	id: "dsh-system-prompt-editor",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/shared/catalog.ts
		/** Every band value, for boundary validators that must not import runtime logic. */
		const SECTION_BANDS = [
			"identity",
			"source",
			"web-surface",
			"persona",
			"plan",
			"file-reference",
			"code-only",
			"tool-guidance",
			"sdk",
			"deliverables",
			"custom",
			"other"
		];
		/** Registry name of the fixed harness identity opener. */
		const IDENTITY_SECTION = "harness:identity";
		/** Registry name of the harness source-checkout line (added by app-boot). */
		const SOURCE_SECTION = "harness:source";
		/** Registry name of the web-surface orientation section (added by web-app). */
		const WEB_SURFACE_SECTION = "app:web-surface";
		/** Registry name of the deployment persona slot. */
		const PERSONA_SECTION = "deployment:persona";
		/** Registry name of the plan-mode policy section (state-driven). */
		const PLAN_POLICY_SECTION = "plan:policy";
		/** Registry name of the file-reference note (per-agent, tool-gated). */
		const FILE_REFERENCE_SECTION = "context:file-reference";
		/** Registry name of the code-mode collapse rule (state/code-mode driven). */
		const CODE_ONLY_SECTION = "tools:code-only";
		/** Name of the single tool-guidance section this plugin inserts as a replacement. */
		const TOOL_GUIDANCE_SECTION = "user:tool-guidance";
		/** Registry name of the code SDK guidance (state/code-mode driven). */
		const SDK_SECTION = "tools:sdk";
		/** Registry name of the deliverables note. */
		const DELIVERABLES_SECTION = "ui:deliverable-file-references";
		/** The curated, editable sections (Tier A), in render order. */
		const SECTION_CATALOG = [
			{
				key: `section:${IDENTITY_SECTION}`,
				storage: {
					kind: "section",
					name: IDENTITY_SECTION
				},
				name: IDENTITY_SECTION,
				order: -100,
				label: "Harness identity",
				band: "identity",
				editable: true,
				caption: "Replaces the fixed identity opener; empty keeps it.",
				caution: "The identity line orients the model to the harness. Replacing it removes that orientation for every session."
			},
			{
				key: `section:${SOURCE_SECTION}`,
				storage: {
					kind: "section",
					name: SOURCE_SECTION
				},
				name: SOURCE_SECTION,
				order: -99,
				label: "Source checkout",
				band: "source",
				editable: true,
				caption: "Replaces the harness source-checkout line; empty keeps it.",
				caution: "The source line names the implementation checkout the harness edits. Replacing it hides machine orientation."
			},
			{
				key: `section:${WEB_SURFACE_SECTION}`,
				storage: {
					kind: "section",
					name: WEB_SURFACE_SECTION
				},
				name: WEB_SURFACE_SECTION,
				order: -98,
				label: "Web surface",
				band: "web-surface",
				editable: true,
				caption: "Replaces the web-surface orientation section; empty keeps it.",
				caution: "This section tells the model it is talking through the web surface. Replacing it may confuse sessions about their surface."
			},
			{
				key: "field:persona",
				storage: {
					kind: "field",
					field: "persona"
				},
				name: PERSONA_SECTION,
				order: 0,
				label: "Persona",
				band: "persona",
				editable: true,
				caption: "Overrides the deployment persona when non-empty; empty keeps the deployment default."
			},
			{
				key: `section:${FILE_REFERENCE_SECTION}`,
				storage: {
					kind: "section",
					name: FILE_REFERENCE_SECTION
				},
				name: FILE_REFERENCE_SECTION,
				order: 99,
				label: "File-reference note",
				band: "file-reference",
				editable: true,
				caption: "Replaces the note about mentioning created/modified files in the final response; empty keeps it.",
				caution: "This note is what makes changed-file links clickable in Web output. It is registered per agent, so it is absent from the scope-less preview, but the override still replaces it in real sessions."
			},
			{
				key: "field:toolGuidance",
				storage: {
					kind: "field",
					field: "toolGuidance"
				},
				name: TOOL_GUIDANCE_SECTION,
				order: 150,
				label: "Tool guidance",
				band: "tool-guidance",
				editable: true,
				caption: "Replaces the per-tool guidance sections when non-empty; empty keeps the defaults."
			},
			{
				key: `section:${DELIVERABLES_SECTION}`,
				storage: {
					kind: "section",
					name: DELIVERABLES_SECTION
				},
				name: DELIVERABLES_SECTION,
				order: 190,
				label: "Deliverables note",
				band: "deliverables",
				editable: true,
				caption: "Replaces the response-format note about mentioning primary outputs; empty keeps it."
			},
			{
				key: "field:text",
				storage: {
					kind: "field",
					field: "text"
				},
				name: "user:system-prompt-editor",
				order: 200,
				label: "Custom system prompt text",
				band: "custom",
				editable: true,
				caption: "Appended verbatim after the persona and tool guidance."
			}
		];
		/** Sections owned by DSH state/code-mode plugins: shown read-only, never edited. */
		const MANAGED_SECTIONS = [
			{
				key: `section:${PLAN_POLICY_SECTION}`,
				storage: {
					kind: "section",
					name: PLAN_POLICY_SECTION
				},
				name: PLAN_POLICY_SECTION,
				order: 50,
				label: "Plan mode policy",
				band: "plan",
				editable: false,
				caption: "Rendered only while plan mode is active; managed by dsh-plan-mode."
			},
			{
				key: `section:${CODE_ONLY_SECTION}`,
				storage: {
					kind: "section",
					name: CODE_ONLY_SECTION
				},
				name: CODE_ONLY_SECTION,
				order: 99,
				label: "Code-mode rule",
				band: "code-only",
				editable: false,
				caption: "Rendered only in code-mode deployments; managed by dsh-tools."
			},
			{
				key: `section:${SDK_SECTION}`,
				storage: {
					kind: "section",
					name: SDK_SECTION
				},
				name: SDK_SECTION,
				order: 150,
				label: "Code SDK guidance",
				band: "sdk",
				editable: false,
				caption: "Rendered only in code-mode deployments; managed by dsh-tools."
			}
		];
		[...SECTION_CATALOG, ...MANAGED_SECTIONS];
		/** Registry names this plugin shows read-only. */
		const MANAGED_SECTION_NAMES = new Set(MANAGED_SECTIONS.map((entry) => entry.name));
		/**
		* Every registry name the curated catalog (editable cards) or the managed
		* list covers, field-backed entries included (`deployment:persona`, tool
		* guidance, custom text). Preview discovery must never re-offer these as
		* generic cards — that is what doubled the panel.
		*/
		const CATALOG_SECTION_NAMES = new Set([...SECTION_CATALOG, ...MANAGED_SECTIONS].map((entry) => entry.name));
		/** The registry name of a section-storage entry, when it is one. */
		function sectionStorageName(storage) {
			return storage.kind === "section" ? storage.name : void 0;
		}
		new Set(SECTION_CATALOG.filter((entry) => entry.editable).map((entry) => sectionStorageName(entry.storage)).filter((name) => name !== void 0));
		//#endregion
		//#region src/client/SystemPromptEditorPanel.tsx
		/**
		* The System Prompt Editor settings page: one editor card per curated,
		* editable section (Tier A — identity, source, web surface, persona,
		* file-reference, tool guidance, deliverables, custom), plus cards for
		* third-party sections discovered through the last preview (Tier B), each
		* with the same three actions — Save, Preview system prompt, and Load current
		* system prompt — and a shared preview of the FULL assembled prompt annotated
		* by band, with DSH-managed sections shown read-only.
		*
		* Everything arrives through the props shares (AGENTS.md): the bound scope
		* snapshot through the injected `useSystemPromptSettings` selector hook, the
		* write path through the injected `save` callback, and the host-side assembly
		* through the injected `preview` callback. The component never sees ctx nor
		* the scope source itself.
		*/
		const MONOSPACE = "ui-monospace, SFMono-Regular, Menlo, Consolas, \"Liberation Mono\", monospace";
		/** Display label for the tool-guidance band (a range, not one order). */
		const TOOL_BAND_ORDER_LABEL = "orders 100–199";
		function curatedCards() {
			return SECTION_CATALOG.filter((entry) => entry.editable).map((entry) => ({
				key: entry.key,
				target: entry.storage.kind === "field" ? {
					kind: "field",
					field: entry.storage.field
				} : {
					kind: "section",
					name: entry.storage.name
				},
				label: entry.label,
				orderLabel: entry.band === "tool-guidance" ? TOOL_BAND_ORDER_LABEL : `order ${entry.order}`,
				hint: entry.caption,
				...entry.caution === void 0 ? {} : { caution: entry.caution }
			}));
		}
		function discoveredCards(sections) {
			return sections.filter((section) => !CATALOG_SECTION_NAMES.has(section.name) && !section.name.startsWith("tool:")).map((section) => ({
				key: `discovered:${section.name}`,
				target: {
					kind: "section",
					name: section.name
				},
				label: section.name,
				orderLabel: section.order === void 0 ? "order unknown" : `order ${section.order}`,
				hint: "Any non-empty text replaces this section for every session; empty keeps it. This section was seen in a preview, not a curated catalog entry."
			}));
		}
		/** Assembling with empty drafts returns the CURRENT effective prompt (stored overrides applied). */
		const EMPTY_DRAFTS = {
			text: "",
			persona: "",
			toolGuidance: "",
			sections: {}
		};
		/**
		* The effective text of one card target from a fresh assembly: the stored
		* override when one exists, otherwise the deployment default. Field targets
		* map to their registry section; the tool band falls back to joining the
		* per-tool guidance sections when no replacement is stored. Returns undefined
		* when the assembly has no text for the target (custom section by default,
		* per-agent sections absent from the scope-less preview).
		*/
		function effectiveText(result, target) {
			if (target.kind === "section") return result.sections.find((section) => section.name === target.name)?.text;
			if (target.field === "persona") return result.sections.find((section) => section.name === PERSONA_SECTION)?.text;
			if (target.field === "toolGuidance") {
				const replacement = result.sections.find((section) => section.name === TOOL_GUIDANCE_SECTION);
				if (replacement !== void 0) return replacement.text;
				const band = result.sections.filter((section) => section.band === "tool-guidance");
				if (band.length > 0) return band.map((section) => section.text).filter((text) => text !== "").join("\n\n");
			}
		}
		const BAND_LABELS = {
			identity: "Harness identity",
			source: "Source checkout",
			"web-surface": "Web surface",
			persona: "Persona",
			plan: "Plan mode policy",
			"file-reference": "File reference",
			"code-only": "Code-mode rule",
			"tool-guidance": "Tool guidance",
			sdk: "Code SDK guidance",
			deliverables: "Deliverables note",
			custom: "Custom text",
			other: "Other section"
		};
		const styles = {
			root: {
				display: "flex",
				flexDirection: "column",
				gap: "12px",
				padding: "16px 20px",
				maxWidth: "760px"
			},
			title: {
				margin: 0,
				fontSize: "15px",
				fontWeight: 600,
				color: "var(--dsw-alias-label-primary)"
			},
			card: {
				display: "flex",
				flexDirection: "column",
				gap: "8px",
				padding: "12px 14px",
				background: "var(--dsw-alias-bg-layer-0)",
				border: "1px solid var(--dsw-alias-border-l1)",
				borderRadius: "10px"
			},
			editor: {
				width: "100%",
				minHeight: "120px",
				padding: "10px 12px",
				fontSize: "13px",
				lineHeight: "1.5",
				fontFamily: MONOSPACE,
				color: "var(--dsw-alias-label-primary)",
				background: "var(--dsw-alias-bg-layer-1)",
				border: "1px solid var(--dsw-alias-border-l1)",
				borderRadius: "8px",
				resize: "vertical",
				boxSizing: "border-box"
			},
			hint: {
				margin: 0,
				fontSize: "12px",
				color: "var(--dsw-alias-label-tertiary)"
			},
			notice: {
				margin: 0,
				fontSize: "12px",
				color: "var(--dsw-alias-brand-text)"
			},
			caution: {
				margin: 0,
				fontSize: "12px",
				color: "var(--dsw-alias-state-warn-primary)"
			},
			error: {
				margin: 0,
				fontSize: "12px",
				color: "var(--dsw-alias-interactive-bg-hover-danger)"
			},
			actions: {
				display: "flex",
				gap: "8px",
				flexWrap: "wrap",
				alignItems: "center"
			},
			button: {
				padding: "6px 14px",
				fontSize: "13px",
				borderRadius: "6px",
				border: "1px solid var(--dsw-alias-border-l2)",
				background: "var(--dsw-alias-bg-layer-2)",
				color: "var(--dsw-alias-label-primary)",
				cursor: "pointer"
			},
			primaryButton: {
				padding: "6px 14px",
				fontSize: "13px",
				borderRadius: "6px",
				border: "none",
				background: "var(--dsw-alias-button-primary-fill)",
				color: "var(--dsw-alias-label-primary-foreground)",
				cursor: "pointer"
			},
			disabledButton: {
				opacity: .4,
				cursor: "not-allowed"
			},
			status: {
				margin: 0,
				fontSize: "12px",
				color: "var(--dsw-alias-label-secondary)"
			},
			preview: {
				margin: 0,
				padding: "12px 14px",
				fontSize: "12.5px",
				lineHeight: "1.55",
				fontFamily: MONOSPACE,
				whiteSpace: "pre-wrap",
				wordBreak: "break-word",
				color: "var(--dsw-alias-label-primary)",
				background: "var(--dsw-alias-bg-layer-1)",
				border: "1px solid var(--dsw-alias-border-l1)",
				borderRadius: "8px"
			},
			caption: {
				margin: 0,
				fontSize: "12px",
				lineHeight: "1.5",
				color: "var(--dsw-alias-label-tertiary)"
			},
			badge: {
				marginLeft: "8px",
				padding: "2px 8px",
				fontSize: "11px",
				fontWeight: 600,
				borderRadius: "999px",
				color: "var(--dsw-alias-label-tertiary)",
				border: "1px solid var(--dsw-alias-border-l2)"
			},
			managedBadge: {
				marginLeft: "8px",
				padding: "2px 8px",
				fontSize: "11px",
				fontWeight: 600,
				borderRadius: "999px",
				color: "var(--dsw-alias-state-warn-primary)",
				border: "1px solid var(--dsw-alias-state-warn-secondary)"
			},
			heading: {
				display: "flex",
				alignItems: "center",
				gap: "8px"
			},
			orderChip: {
				padding: "1px 8px",
				fontSize: "11px",
				fontWeight: 500,
				borderRadius: "999px",
				color: "var(--dsw-alias-label-tertiary)",
				background: "var(--dsw-alias-bg-layer-1)",
				border: "1px solid var(--dsw-alias-border-l2)",
				whiteSpace: "nowrap"
			},
			previewHeader: {
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between"
			},
			sectionBlock: {
				margin: 0,
				padding: "10px 12px",
				fontSize: "12.5px",
				lineHeight: "1.55",
				fontFamily: MONOSPACE,
				whiteSpace: "pre-wrap",
				wordBreak: "break-word",
				color: "var(--dsw-alias-label-primary)",
				background: "var(--dsw-alias-bg-layer-1)",
				border: "1px solid var(--dsw-alias-border-l1)",
				borderRadius: "8px"
			},
			sectionLabel: {
				display: "flex",
				alignItems: "center",
				gap: "6px",
				margin: "10px 0 4px"
			}
		};
		const INITIAL_STATE = {
			draft: "",
			editStartedFrom: null,
			outcome: null,
			loadNote: null
		};
		const PREVIEW_STATE = {
			open: false,
			loading: false,
			error: null,
			result: null
		};
		/** Build the initial card-state map for the curated cards. */
		function initialCards() {
			const out = {};
			for (const card of curatedCards()) out[card.key] = INITIAL_STATE;
			return out;
		}
		/**
		* Render the System Prompt settings page.
		* @param props - section owner share plus the injected scope face.
		* @returns the page.
		*/
		function SystemPromptEditorPanel(props) {
			const snapshot = props.useSystemPromptSettings((s) => s);
			const ready = snapshot.status === "ready";
			const stored = (target) => {
				if (target.kind === "field") return snapshot.value?.[target.field] ?? "";
				return snapshot.value?.sections?.[target.name] ?? "";
			};
			const curated = (0, react.useMemo)(curatedCards, []);
			const [discovered, setDiscovered] = (0, react.useState)([]);
			const [drafts, setDrafts] = (0, react.useState)(initialCards);
			const [savingCard, setSavingCard] = (0, react.useState)(null);
			const [loadingCard, setLoadingCard] = (0, react.useState)(null);
			const [preview, setPreview] = (0, react.useState)(PREVIEW_STATE);
			const allCards = (0, react.useMemo)(() => [...curated, ...discovered], [curated, discovered]);
			const cardByKey = (0, react.useMemo)(() => {
				const map = /* @__PURE__ */ new Map();
				for (const card of allCards) map.set(card.key, card);
				return map;
			}, [allCards]);
			(0, react.useEffect)(() => {
				setDrafts((current) => {
					let next = current;
					for (const card of allCards) {
						const state = current[card.key];
						if (state === void 0 || state.editStartedFrom !== null) continue;
						const adopted = stored(card.target);
						if (state.draft === adopted) continue;
						next = next === current ? { ...current } : next;
						next[card.key] = {
							...state,
							draft: adopted
						};
					}
					return next;
				});
			}, [snapshot.value, allCards]);
			const handleEdit = (key, text) => {
				setDrafts((current) => ({
					...current,
					[key]: {
						draft: text,
						editStartedFrom: current[key]?.editStartedFrom ?? stored(cardByKey.get(key).target),
						outcome: null,
						loadNote: null
					}
				}));
			};
			const handleSave = async (key) => {
				const card = cardByKey.get(key);
				if (card === void 0) return;
				const value = drafts[key]?.draft ?? "";
				setSavingCard(key);
				setDrafts((current) => ({
					...current,
					[key]: {
						...current[key],
						outcome: null
					}
				}));
				try {
					const result = await props.save(card.target, value);
					setDrafts((current) => ({
						...current,
						[key]: {
							...current[key],
							outcome: result,
							editStartedFrom: result.status === "saved" ? null : current[key].editStartedFrom
						}
					}));
				} finally {
					setSavingCard(null);
				}
			};
			const handleLoad = async (key) => {
				const card = cardByKey.get(key);
				if (card === void 0 || loadingCard !== null) return;
				const storedValue = stored(card.target);
				setLoadingCard(key);
				try {
					let picked;
					let loadNote = null;
					const outcome = await props.preview(EMPTY_DRAFTS);
					if (outcome.status === "previewed") picked = effectiveText(outcome.result, card.target);
					const draft = picked ?? storedValue;
					if (outcome.status === "error") loadNote = `Could not assemble the current prompt: ${outcome.message}`;
					else if (card.target.kind === "field" && card.target.field === "text" && storedValue === "") loadNote = "This section is empty by default — there is no deployment text to load. Use Preview to see the full prompt.";
					else if (picked !== void 0 && picked !== "" && storedValue === "") loadNote = "No stored value — loaded the current default section text. Saving stores it as a fixed override.";
					else if (picked === void 0 && storedValue === "" && card.target.kind === "field" && card.target.field === "toolGuidance") loadNote = "No stored value, and no tool-guidance sections are visible yet — they register per agent. Run one session first: the plugin snapshots the real per-tool guidance during assembly, and Load will then replay it.";
					else if (picked === void 0 && storedValue === "") loadNote = "Nothing to load — no stored value, and this preview has no text for the section (it may be per-agent or empty). Use Preview to see the full prompt.";
					setDrafts((current) => ({
						...current,
						[key]: {
							...current[key],
							draft,
							editStartedFrom: draft === storedValue ? null : storedValue,
							outcome: null,
							loadNote
						}
					}));
				} finally {
					setLoadingCard(null);
				}
			};
			const handlePreview = async () => {
				setPreview((current) => ({
					...current,
					open: true,
					loading: true,
					error: null
				}));
				const sectionDrafts = allCards.reduce((acc, card) => {
					if (card.target.kind === "section") acc[card.target.name] = drafts[card.key]?.draft ?? "";
					return acc;
				}, {});
				const outcome = await props.preview({
					text: drafts["field:text"]?.draft ?? "",
					persona: drafts["field:persona"]?.draft ?? "",
					toolGuidance: drafts["field:toolGuidance"]?.draft ?? "",
					sections: sectionDrafts
				});
				if (outcome.status === "previewed") {
					setPreview((current) => ({
						...current,
						loading: false,
						error: null,
						result: outcome.result
					}));
					setDiscovered(discoveredCards(outcome.result.sections));
				} else setPreview((current) => ({
					...current,
					loading: false,
					error: outcome.message,
					result: null
				}));
			};
			const actionsDisabled = savingCard !== null || loadingCard !== null || !ready;
			const anyUnsaved = allCards.some((card) => {
				const state = drafts[card.key];
				return state !== void 0 && state.draft !== stored(card.target);
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: styles.root,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						style: styles.title,
						children: "System prompt"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: styles.hint,
						children: "Every editable section of the assembled system prompt of a new session. Preview shows the FULL prompt as the model sees it, with your drafts applied. DSH-managed sections (plan mode, code mode) are read-only."
					}),
					snapshot.status === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: styles.status,
						role: "status",
						children: "Loading settings…"
					}) : snapshot.status === "unavailable" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: styles.notice,
						role: "status",
						children: "Settings are process-local; this page is inert in remote browsers."
					}) : !snapshot.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: styles.status,
						role: "status",
						children: "The settings document is read-only; saving is disabled."
					}) : null,
					allCards.map((card) => {
						const state = drafts[card.key] ?? INITIAL_STATE;
						const storedValue = stored(card.target);
						const storedChanged = state.editStartedFrom !== null && state.editStartedFrom !== storedValue;
						const saveDisabled = actionsDisabled || !ready || !snapshot.writable;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							"aria-label": card.label,
							style: styles.card,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: styles.heading,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
											style: {
												...styles.title,
												fontSize: "13.5px"
											},
											children: card.label
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: styles.orderChip,
											children: card.orderLabel
										}),
										state.draft !== storedValue ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: styles.badge,
											children: "Unsaved"
										}) : null
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									"aria-label": card.label,
									value: state.draft,
									onChange: (event) => handleEdit(card.key, event.target.value),
									disabled: !ready,
									spellCheck: false,
									style: styles.editor
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: styles.hint,
									children: card.hint
								}),
								card.caution !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: styles.caution,
									children: card.caution
								}) : null,
								storedChanged ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: styles.notice,
									role: "status",
									children: "The stored value changed while you were editing; your draft is kept. Load to re-read it."
								}) : null,
								state.outcome?.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
									style: styles.error,
									role: "status",
									children: ["Save failed: ", state.outcome.message]
								}) : state.outcome?.status === "not-applied" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: styles.error,
									role: "status",
									children: "Save did not take effect — the stored value may have changed. Load to re-read it. Your draft is kept."
								}) : state.outcome?.status === "saved" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: styles.status,
									role: "status",
									children: "Saved."
								}) : null,
								state.loadNote ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: styles.notice,
									role: "status",
									children: state.loadNote
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: styles.actions,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											style: saveDisabled ? {
												...styles.primaryButton,
												...styles.disabledButton
											} : styles.primaryButton,
											disabled: saveDisabled,
											onClick: () => {
												handleSave(card.key);
											},
											children: savingCard === card.key ? "Saving…" : "Save"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											style: actionsDisabled ? {
												...styles.button,
												...styles.disabledButton
											} : styles.button,
											disabled: actionsDisabled,
											onClick: () => {
												handlePreview();
											},
											children: "Preview system prompt"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											style: actionsDisabled ? {
												...styles.button,
												...styles.disabledButton
											} : styles.button,
											disabled: actionsDisabled,
											onClick: () => {
												handleLoad(card.key);
											},
											children: loadingCard === card.key ? "Loading…" : "Load current system prompt"
										})
									]
								})
							]
						}, card.key);
					}),
					preview.open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						"aria-label": "Full system prompt preview",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: styles.previewHeader,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: styles.status,
									children: preview.loading ? "Assembling the full system prompt…" : "Full system prompt (drafts applied)"
								}), preview.loading || anyUnsaved ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: styles.badge,
									children: "Unsaved drafts"
								}) : null]
							}),
							preview.error ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								style: styles.error,
								role: "status",
								children: ["Preview failed: ", preview.error]
							}) : null,
							preview.result === null && !preview.loading && preview.error === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: styles.hint,
								children: "Nothing assembled yet."
							}) : null,
							preview.result !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								preview.result.error ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
									style: styles.error,
									role: "status",
									children: ["Variable interpolation failed: ", preview.result.error]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: styles.hint,
									children: "Showing the raw sections below (variables unresolved)."
								})] }) : null,
								preview.result.sections.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: styles.hint,
									children: "The assembled prompt is empty."
								}) : preview.result.sections.map((section) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: styles.sectionLabel,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: styles.orderChip,
											children: [BAND_LABELS[section.band], section.order === void 0 ? "" : ` · ${section.order}`]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: styles.caption,
											children: section.name
										}),
										MANAGED_SECTION_NAMES.has(section.name) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: styles.managedBadge,
											children: "Managed by DSH"
										}) : null
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
									style: styles.sectionBlock,
									children: section.text
								})] }, section.name)),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
									style: styles.caption,
									children: [
										"Sections render in order, joined with blank lines; this is the full prompt the model reads. ",
										"{{name}}",
										" variables (e.g. ",
										"{{model}}",
										", ",
										"{{provider}}",
										") resolve from the default model selection where it exists; a reference with no scope-less value (like ",
										"{{cwd}}",
										") stays literal here and resolves per session. This preview assembles without a specific agent, so per-agent presets and per-agent sections (like the file-reference note) may differ."
									]
								})
							] }) : null
						]
					}) : null
				]
			});
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
		/** Whether a value is a plain record of strings (the `sections` dict shape). */
		function isStringMap(value) {
			return isRecord(value) && Object.values(value).every(isString);
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
						const { text, persona, toolGuidance, sections } = value;
						if (!isString(text) || !isString(persona) || !isString(toolGuidance)) throw new TypeError("drafts.text, drafts.persona and drafts.toolGuidance must all be strings");
						if (!isStringMap(sections)) throw new TypeError("drafts.sections must be a plain object whose values are all strings");
						return {
							text,
							persona,
							toolGuidance,
							sections
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
					const { text, persona, toolGuidance, sections: effectiveSections } = effective;
					if (!isString(text) || !isString(persona) || !isString(toolGuidance)) throw new TypeError("preview result effective fields must all be strings");
					if (!isStringMap(effectiveSections)) throw new TypeError("preview result effective.sections must be a plain object whose values are all strings");
					const parsed = {
						rendered,
						sections: sections.map((entry, index) => {
							if (!isRecord(entry) || !isString(entry.name) || !isString(entry.text)) throw new TypeError(`preview result section ${String(index)} must have string name and text`);
							const band = entry.band;
							if (typeof band !== "string" || !SECTION_BANDS.includes(band)) throw new TypeError(`preview result section ${String(index)} has an invalid band`);
							const parsedBand = band;
							const order = entry.order;
							if (order !== void 0 && (typeof order !== "number" || !Number.isFinite(order))) throw new TypeError(`preview result section ${String(index)} has an invalid order`);
							const parsed = {
								name: entry.name,
								text: entry.text,
								band: parsedBand
							};
							return order === void 0 ? parsed : {
								...parsed,
								order
							};
						}),
						effective: {
							text,
							persona,
							toolGuidance,
							sections: effectiveSections
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
		//#region src/client/index.ts
		/** Required services (cordis fiber inject). */
		const inject = [
			"slots",
			"settingsScope",
			"remote"
		];
		/**
		* Register the Settings page for the system-prompt-editor namespace.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			const scope = ctx.settingsScope.bind({ namespace: "system-prompt-editor" });
			const save = async (target, value) => {
				try {
					if (target.kind === "field") await scope.set(target.field, value);
					else {
						const next = { ...scope.getSnapshot().value?.sections ?? {} };
						if (value === "") delete next[target.name];
						else next[target.name] = value;
						await scope.set("sections", next);
					}
				} catch (error) {
					return {
						status: "error",
						message: error instanceof Error ? error.message : String(error)
					};
				}
				const snapshot = scope.getSnapshot();
				return (target.kind === "field" ? snapshot.value?.[target.field] : snapshot.value?.sections?.[target.name] ?? "") === value ? { status: "saved" } : { status: "not-applied" };
			};
			const mount = ctx.remote.$mount({
				package: "dsh-system-prompt-editor",
				descriptors: [PREVIEW_DESCRIPTOR]
			});
			mount.catch(() => {});
			const preview = async (drafts) => {
				try {
					await mount;
					const namespace = ctx.get("remote.systemPromptEditorPreview");
					if (namespace === void 0) return {
						status: "error",
						message: "Preview is unavailable — the preview remote is not mounted."
					};
					const result = await namespace.preview(drafts);
					if (result.ok) return {
						status: "previewed",
						result: result.value
					};
					return {
						status: "error",
						message: `Preview failed: ${result.error.message} (${result.error.code})`
					};
				} catch (error) {
					return {
						status: "error",
						message: error instanceof Error ? error.message : String(error)
					};
				}
			};
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "system-prompt-editor",
				order: 200,
				label: "System Prompt",
				inject: () => ({
					hooks: { systemPromptSettings: scope },
					save,
					preview
				})
			}, SystemPromptEditorPanel));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map