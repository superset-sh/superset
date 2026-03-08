import {
	defaultKeymap,
	history,
	historyKeymap,
	indentWithTab,
	selectAll,
} from "@codemirror/commands";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import {
	highlightSelectionMatches,
	openSearchPanel,
	searchKeymap,
} from "@codemirror/search";
import {
	Compartment,
	EditorSelection,
	EditorState,
	StateEffect,
	StateField,
} from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	drawSelection,
	dropCursor,
	EditorView,
	highlightActiveLine,
	highlightActiveLineGutter,
	highlightSpecialChars,
	keymap,
	lineNumbers,
} from "@codemirror/view";
import { cn } from "@superset/ui/utils";
import { type MutableRefObject, useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { CodeEditorAdapter } from "renderer/screens/main/components/WorkspaceView/ContentView/components";
import { getCodeSyntaxHighlighting } from "renderer/screens/main/components/WorkspaceView/utils/code-theme";
import { createCodeMirrorTheme } from "./createCodeMirrorTheme";
import { loadLanguageSupport } from "./loadLanguageSupport";

interface CodeEditorProps {
	value: string;
	language: string;
	readOnly?: boolean;
	fillHeight?: boolean;
	className?: string;
	editorRef?: MutableRefObject<CodeEditorAdapter | null>;
	onChange?: (value: string) => void;
	onSave?: () => void;
}

const setHighlightRangeEffect = StateEffect.define<{
	from: number;
	to: number;
} | null>();

function createJumpTargetDecorations(
	state: EditorState,
	from: number,
	to: number,
): DecorationSet {
	const startLine = state.doc.lineAt(from).number;
	const endLine = state.doc.lineAt(to).number;
	const decorations = [];

	for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
		const line = state.doc.line(lineNumber);
		decorations.push(
			Decoration.line({
				class: "cm-jump-target-section",
			}).range(line.from),
		);
		decorations.push(
			Decoration.mark({
				class: "cm-jump-target-section-text",
			}).range(line.from, line.to),
		);
	}

	return Decoration.set(decorations);
}

const highlightRangeField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(decorations, transaction) {
		decorations = decorations.map(transaction.changes);

		for (const effect of transaction.effects) {
			if (!effect.is(setHighlightRangeEffect)) {
				continue;
			}

			if (!effect.value) {
				decorations = Decoration.none;
				continue;
			}

			decorations = createJumpTargetDecorations(
				transaction.state,
				effect.value.from,
				effect.value.to,
			);
		}

		return decorations;
	},
	provide: (field) => EditorView.decorations.from(field),
});

function createCodeMirrorAdapter(view: EditorView): CodeEditorAdapter {
	let disposed = false;

	return {
		focus() {
			view.focus();
		},
		getValue() {
			return view.state.doc.toString();
		},
		setValue(value) {
			view.dispatch({
				changes: {
					from: 0,
					to: view.state.doc.length,
					insert: value,
				},
			});
		},
		revealPosition(line, column = 1, highlightRange) {
			const safeLine = Math.max(1, Math.min(line, view.state.doc.lines));
			const lineInfo = view.state.doc.line(safeLine);
			const offset = Math.min(column - 1, lineInfo.length);
			const anchor = lineInfo.from + Math.max(0, offset);
			const effects = [];

			if (highlightRange) {
				const startLine = Math.max(
					1,
					Math.min(highlightRange.startLine, view.state.doc.lines),
				);
				const endLine = Math.max(
					startLine,
					Math.min(highlightRange.endLine, view.state.doc.lines),
				);
				const startLineInfo = view.state.doc.line(startLine);
				const endLineInfo = view.state.doc.line(endLine);

				effects.push(
					setHighlightRangeEffect.of({
						from: startLineInfo.from,
						to: endLineInfo.to,
					}),
				);
			} else {
				effects.push(setHighlightRangeEffect.of(null));
			}

			view.dispatch({
				selection: EditorSelection.cursor(anchor),
				effects,
				scrollIntoView: true,
			});
			view.focus();
		},
		getSelectionLines() {
			const selection = view.state.selection.main;
			const startLine = view.state.doc.lineAt(selection.from).number;
			const endLine = view.state.doc.lineAt(selection.to).number;
			return { startLine, endLine };
		},
		selectAll() {
			selectAll(view);
		},
		cut() {
			if (view.state.readOnly) return;
			const clipboard = navigator.clipboard;
			if (!clipboard) return;

			const selection = view.state.selection.main;
			if (selection.empty) return;

			const text = view.state.sliceDoc(selection.from, selection.to);
			void clipboard
				.writeText(text)
				.then(() => {
					const currentSelection = view.state.selection.main;
					if (
						currentSelection.from !== selection.from ||
						currentSelection.to !== selection.to
					) {
						return;
					}

					if (view.state.sliceDoc(selection.from, selection.to) !== text) {
						return;
					}

					view.dispatch({
						changes: { from: selection.from, to: selection.to, insert: "" },
					});
				})
				.catch((error) => {
					console.error("[CodeEditor] Failed to cut selection:", error);
				});
		},
		copy() {
			const clipboard = navigator.clipboard;
			if (!clipboard) return;

			const selection = view.state.selection.main;
			if (selection.empty) return;

			void clipboard
				.writeText(view.state.sliceDoc(selection.from, selection.to))
				.catch((error) => {
					console.error("[CodeEditor] Failed to copy selection:", error);
				});
		},
		paste() {
			if (view.state.readOnly) return;
			const clipboard = navigator.clipboard;
			if (!clipboard) return;

			void clipboard
				.readText()
				.then((text) => {
					const selection = view.state.selection.main;
					view.dispatch({
						changes: {
							from: selection.from,
							to: selection.to,
							insert: text,
						},
						selection: EditorSelection.cursor(selection.from + text.length),
					});
				})
				.catch((error) => {
					console.error("[CodeEditor] Failed to paste from clipboard:", error);
				});
		},
		openFind() {
			openSearchPanel(view);
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			view.destroy();
		},
	};
}

export function CodeEditor({
	value,
	language,
	readOnly = false,
	fillHeight = true,
	className,
	editorRef,
	onChange,
	onSave,
}: CodeEditorProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const languageCompartment = useRef(new Compartment()).current;
	const themeCompartment = useRef(new Compartment()).current;
	const editableCompartment = useRef(new Compartment()).current;
	const onChangeRef = useRef(onChange);
	const onSaveRef = useRef(onSave);
	const { data: fontSettings } = electronTrpc.settings.getFontSettings.useQuery(
		undefined,
		{
			staleTime: 30_000,
		},
	);
	const editorFontFamily = fontSettings?.editorFontFamily ?? undefined;
	const editorFontSize = fontSettings?.editorFontSize ?? undefined;

	onChangeRef.current = onChange;
	onSaveRef.current = onSave;

	// biome-ignore lint/correctness/useExhaustiveDependencies: Editor instance is created once and reconfigured via dedicated effects below
	useEffect(() => {
		if (!containerRef.current) return;

		const updateListener = EditorView.updateListener.of((update) => {
			if (!update.docChanged) return;
			onChangeRef.current?.(update.state.doc.toString());
		});

		const saveKeymap = keymap.of([
			{
				key: "Mod-s",
				run: () => {
					onSaveRef.current?.();
					return true;
				},
			},
		]);

		const state = EditorState.create({
			doc: value,
			extensions: [
				highlightRangeField,
				lineNumbers(),
				highlightActiveLineGutter(),
				highlightSpecialChars(),
				history(),
				drawSelection(),
				dropCursor(),
				EditorState.allowMultipleSelections.of(true),
				indentOnInput(),
				bracketMatching(),
				highlightActiveLine(),
				highlightSelectionMatches(),
				EditorView.lineWrapping,
				editableCompartment.of([
					EditorState.readOnly.of(readOnly),
					EditorView.editable.of(!readOnly),
				]),
				EditorView.contentAttributes.of({
					"data-testid": "code-editor",
					spellcheck: "false",
				}),
				EditorView.theme({
					".cm-jump-target-section": {
						backgroundColor:
							"color-mix(in srgb, var(--accent) 24%, transparent)",
						boxShadow:
							"inset 3px 0 0 color-mix(in srgb, var(--accent) 75%, white)",
					},
					".cm-jump-target-section-text": {
						backgroundColor:
							"color-mix(in srgb, var(--accent) 14%, transparent)",
						borderRadius: "2px",
					},
				}),
				keymap.of([
					indentWithTab,
					...defaultKeymap,
					...historyKeymap,
					...searchKeymap,
				]),
				saveKeymap,
				themeCompartment.of([
					getCodeSyntaxHighlighting(),
					createCodeMirrorTheme(
						{
							fontFamily: editorFontFamily,
							fontSize: editorFontSize,
						},
						fillHeight,
					),
				]),
				languageCompartment.of([]),
				updateListener,
			],
		});

		const view = new EditorView({
			state,
			parent: containerRef.current,
		});
		const adapter = createCodeMirrorAdapter(view);

		viewRef.current = view;
		if (editorRef) {
			editorRef.current = adapter;
		}

		return () => {
			if (editorRef?.current === adapter) {
				editorRef.current = null;
			}
			adapter.dispose();
			viewRef.current = null;
		};
	}, []);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;

		const currentValue = view.state.doc.toString();
		if (currentValue === value) return;

		view.dispatch({
			changes: {
				from: 0,
				to: view.state.doc.length,
				insert: value,
			},
		});
	}, [value]);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;

		view.dispatch({
			effects: themeCompartment.reconfigure([
				getCodeSyntaxHighlighting(),
				createCodeMirrorTheme(
					{
						fontFamily: editorFontFamily,
						fontSize: editorFontSize,
					},
					fillHeight,
				),
			]),
		});
	}, [editorFontFamily, editorFontSize, fillHeight, themeCompartment]);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;

		view.dispatch({
			effects: editableCompartment.reconfigure([
				EditorState.readOnly.of(readOnly),
				EditorView.editable.of(!readOnly),
			]),
		});
	}, [editableCompartment, readOnly]);

	useEffect(() => {
		let cancelled = false;

		void loadLanguageSupport(language)
			.then((extension) => {
				if (cancelled) return;
				const view = viewRef.current;
				if (!view) return;

				view.dispatch({
					effects: languageCompartment.reconfigure(extension ?? []),
				});
			})
			.catch((error) => {
				if (cancelled) return;
				const view = viewRef.current;
				if (!view) return;

				console.error("[CodeEditor] Failed to load language support:", {
					error,
					language,
				});
				view.dispatch({
					effects: languageCompartment.reconfigure([]),
				});
			});

		return () => {
			cancelled = true;
		};
	}, [language, languageCompartment]);

	return (
		<div
			ref={containerRef}
			className={cn(
				"min-w-0",
				fillHeight ? "h-full w-full" : "w-full",
				className,
			)}
		/>
	);
}
