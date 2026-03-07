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
import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
import {
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
		revealPosition(line, column = 1) {
			const safeLine = Math.max(1, Math.min(line, view.state.doc.lines));
			const lineInfo = view.state.doc.line(safeLine);
			const offset = Math.min(column - 1, lineInfo.length);
			const anchor = lineInfo.from + Math.max(0, offset);

			view.dispatch({
				selection: EditorSelection.cursor(anchor),
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
