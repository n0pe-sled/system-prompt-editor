window.__ModuleLoader__.load({
	id: "dsh-system-prompt-editor",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/SystemPromptEditorPanel.tsx
		/**
		* The System Prompt Editor settings page: three multiline editors over the
		* `system-prompt-editor` settings namespace (custom text, persona, tool
		* guidance), each with the same three actions — Save, Preview system prompt,
		* and Load current system prompt — plus a shared preview of the FULL assembled
		* prompt (identity + persona + tool guidance + custom text, drafts applied),
		* annotated by band.
		*
		* Everything arrives through the props shares (AGENTS.md): the bound scope
		* snapshot through the injected `useSystemPromptSettings` selector hook, the
		* write path through the injected `save` callback, and the host-side assembly
		* through the injected `preview` callback. The component never sees ctx nor
		* the scope source itself.
		*/
		const MONOSPACE = "ui-monospace, SFMono-Regular, Menlo, Consolas, \"Liberation Mono\", monospace";
		const CARDS = [
			{
				field: "text",
				title: "Custom system prompt text",
				orderLabel: "order 200",
				hint: "Appended verbatim after the persona and tool guidance."
			},
			{
				field: "persona",
				title: "Persona",
				orderLabel: "order 0",
				hint: "Overrides the deployment persona when non-empty; empty keeps the deployment default."
			},
			{
				field: "toolGuidance",
				title: "Tool guidance",
				orderLabel: "orders 100–199",
				hint: "Replaces the per-tool guidance sections when non-empty; empty keeps the defaults."
			}
		];
		const BAND_LABELS = {
			identity: "Harness identity",
			persona: "Persona",
			"tool-guidance": "Tool guidance",
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
		/**
		* Render the System Prompt settings page.
		* @param props - section owner share plus the injected scope face.
		* @returns the page.
		*/
		function SystemPromptEditorPanel(props) {
			const snapshot = props.useSystemPromptSettings((s) => s);
			const ready = snapshot.status === "ready";
			const stored = (field) => snapshot.value?.[field] ?? "";
			const [cards, setCards] = (0, react.useState)({
				text: INITIAL_STATE,
				persona: INITIAL_STATE,
				toolGuidance: INITIAL_STATE
			});
			const [savingField, setSavingField] = (0, react.useState)(null);
			const [preview, setPreview] = (0, react.useState)(PREVIEW_STATE);
			(0, react.useEffect)(() => {
				setCards((current) => {
					let next = current;
					for (const field of CARDS.map((card) => card.field)) {
						if (current[field]?.editStartedFrom !== null) continue;
						const adopted = stored(field);
						if (current[field]?.draft === adopted) continue;
						next = {
							...next,
							[field]: {
								...current[field],
								draft: adopted
							}
						};
					}
					return next;
				});
			}, [snapshot.value]);
			const handleEdit = (field, text) => {
				setCards((current) => ({
					...current,
					[field]: {
						draft: text,
						editStartedFrom: current[field]?.editStartedFrom ?? stored(field),
						outcome: null,
						loadNote: null
					}
				}));
			};
			const handleSave = async (field) => {
				const value = cards[field]?.draft ?? "";
				setSavingField(field);
				setCards((current) => ({
					...current,
					[field]: {
						...current[field],
						outcome: null
					}
				}));
				try {
					const result = await props.save(field, value);
					setCards((current) => ({
						...current,
						[field]: {
							...current[field],
							outcome: result,
							editStartedFrom: result.status === "saved" ? null : current[field].editStartedFrom
						}
					}));
				} finally {
					setSavingField(null);
				}
			};
			const handleLoad = (field) => {
				const value = stored(field);
				setCards((current) => {
					const state = current[field];
					let draft = value;
					let loadNote = null;
					if (value === "") {
						if (field === "persona") {
							const deployed = preview.result?.sections.find((section) => section.band === "persona" && section.text !== state.draft)?.text;
							if (deployed !== void 0 && deployed !== "") {
								draft = deployed;
								loadNote = "No stored persona — loaded the deployment default from the last preview. Saving it stores a fixed override.";
							} else loadNote = "No stored persona; the deployment default remains in effect.";
						} else loadNote = "Nothing stored — the default sections remain in effect.";
					}
					return {
						...current,
						[field]: {
							...state,
							draft,
							editStartedFrom: null,
							outcome: null,
							loadNote
						}
					};
				});
			};
			const handlePreview = async () => {
				setPreview((current) => ({
					...current,
					open: true,
					loading: true,
					error: null
				}));
				const outcome = await props.preview({
					text: cards.text?.draft ?? "",
					persona: cards.persona?.draft ?? "",
					toolGuidance: cards.toolGuidance?.draft ?? ""
				});
				if (outcome.status === "previewed") setPreview((current) => ({
					...current,
					loading: false,
					error: null,
					result: outcome.result
				}));
				else setPreview((current) => ({
					...current,
					loading: false,
					error: outcome.message,
					result: null
				}));
			};
			const actionsDisabled = savingField !== null || !ready;
			const anyUnsaved = CARDS.some((card) => {
				const state = cards[card.field];
				return state !== void 0 && state.draft !== stored(card.field);
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
						children: "Three fields feed the assembled system prompt of every new session. Preview shows the FULL prompt as the model sees it, with your drafts applied."
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
					CARDS.map((card) => {
						const state = cards[card.field] ?? INITIAL_STATE;
						const storedValue = stored(card.field);
						const storedChanged = state.editStartedFrom !== null && state.editStartedFrom !== storedValue;
						const saveDisabled = actionsDisabled || !ready || !snapshot.writable;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							"aria-label": card.title,
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
											children: card.title
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
									"aria-label": card.title,
									value: state.draft,
									onChange: (event) => handleEdit(card.field, event.target.value),
									disabled: !ready,
									spellCheck: false,
									style: styles.editor
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: styles.hint,
									children: card.hint
								}),
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
												handleSave(card.field);
											},
											children: savingField === card.field ? "Saving…" : "Save"
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
											onClick: () => handleLoad(card.field),
											children: "Load current system prompt"
										})
									]
								})
							]
						}, card.field);
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
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										style: styles.orderChip,
										children: [BAND_LABELS[section.band], section.order === void 0 ? "" : ` · ${section.order}`]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: styles.caption,
										children: section.name
									})]
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
										"{{cwd}}",
										", ",
										"{{model}}",
										", ",
										"{{provider}}",
										") resolve at request time; a strict unresolved reference reports the error above instead of rendering. This preview assembles without a specific agent, so per-agent presets may differ."
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
			const save = async (field, value) => {
				try {
					await scope.set(field, value);
				} catch (error) {
					return {
						status: "error",
						message: error instanceof Error ? error.message : String(error)
					};
				}
				return scope.getSnapshot().value?.[field] === value ? { status: "saved" } : { status: "not-applied" };
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