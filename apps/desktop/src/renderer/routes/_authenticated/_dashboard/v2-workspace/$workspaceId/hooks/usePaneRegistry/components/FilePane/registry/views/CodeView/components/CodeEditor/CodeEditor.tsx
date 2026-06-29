import {
	defaultKeymap,
	history,
	historyKeymap,
	indentWithTab,
} from "@codemirror/commands";
import {
	bracketMatching,
	codeFolding,
	foldGutter,
	foldKeymap,
	indentOnInput,
} from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
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
import { colorPicker } from "@replit/codemirror-css-color-picker";
import { cn } from "@superset/ui/utils";
import { useQuery } from "@tanstack/react-query";
import debounce from "lodash/debounce";
import { type MutableRefObject, useEffect, useRef } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useResolvedTheme } from "renderer/stores/theme";
import {
	type CodeEditorAdapter,
	captureSelection,
	createCodeMirrorAdapter,
} from "./CodeEditorAdapter";
import { SELECTION_CHANGE_DEBOUNCE_MS } from "./constants";
import { createCodeMirrorTheme } from "./createCodeMirrorTheme";
import { contourSelectionLayer } from "./extensions/contourSelectionLayer";
import { buildFoldChevron } from "./extensions/foldChevron";
import { buildFoldPlaceholder } from "./extensions/foldPlaceholder";
import { selectionClassTogglePlugin } from "./extensions/selectionClassTogglePlugin";
import { loadLanguageSupport } from "./loadLanguageSupport";
import { getCodeSyntaxHighlighting } from "./syntax-highlighting";

interface CodeEditorProps {
	value: string;
	language: string;
	readOnly?: boolean;
	fillHeight?: boolean;
	className?: string;
	editorRef?: MutableRefObject<CodeEditorAdapter | null>;
	onChange?: (value: string) => void;
	onSave?: () => void;
	/** Fires on selection change so a host can refresh selection-derived UI. */
	onSelectionChange?: () => void;
	/** Mod-Enter handler to send the current selection to an agent. */
	onSendSelection?: () => void;
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
	onSelectionChange,
	onSendSelection,
}: CodeEditorProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const languageCompartment = useRef(new Compartment()).current;
	const themeCompartment = useRef(new Compartment()).current;
	const editableCompartment = useRef(new Compartment()).current;
	const onChangeRef = useRef(onChange);
	const onSaveRef = useRef(onSave);
	const onSelectionChangeRef = useRef(onSelectionChange);
	const onSendSelectionRef = useRef(onSendSelection);
	// Guards against re-entrant onChange from the value-sync effect's own dispatch.
	const isExternalUpdateRef = useRef(false);
	const { data: fontSettings } = useQuery({
		queryKey: ["electron", "settings", "getFontSettings"],
		queryFn: () => electronTrpcClient.settings.getFontSettings.query(),
		staleTime: 30_000,
	});
	const editorFontFamily = fontSettings?.editorFontFamily ?? undefined;
	const editorFontSize = fontSettings?.editorFontSize ?? undefined;
	const activeTheme = useResolvedTheme();

	onChangeRef.current = onChange;
	onSaveRef.current = onSave;
	onSelectionChangeRef.current = onSelectionChange;
	onSendSelectionRef.current = onSendSelection;

	// biome-ignore lint/correctness/useExhaustiveDependencies: Editor instance is created once and reconfigured via dedicated effects below
	useEffect(() => {
		if (!containerRef.current) return;

		// CodeMirror fires selectionSet on every cursor move; debounce (trailing
		// edge) so selection-derived UI updates once the gesture settles.
		const notifySelectionChange = debounce(() => {
			onSelectionChangeRef.current?.();
		}, SELECTION_CHANGE_DEBOUNCE_MS);

		const updateListener = EditorView.updateListener.of((update) => {
			if (update.selectionSet) {
				notifySelectionChange();
			}
			if (!update.docChanged) return;
			if (isExternalUpdateRef.current) return;
			onChangeRef.current?.(update.state.doc.toString());
		});

		const editorActionKeymap = keymap.of([
			{
				key: "Mod-s",
				run: () => {
					onSaveRef.current?.();
					return true;
				},
			},
			{
				// Mod-Enter sends the current selection. Only consume the chord
				// when there's a sendable selection; otherwise fall through.
				key: "Mod-Enter",
				run: (view) => {
					if (captureSelection(view.state, "") == null) return false;
					onSendSelectionRef.current?.();
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
				foldGutter({ markerDOM: buildFoldChevron }),
				codeFolding({ placeholderDOM: buildFoldPlaceholder }),
				drawSelection(),
				dropCursor(),
				EditorState.allowMultipleSelections.of(true),
				indentOnInput(),
				bracketMatching(),
				highlightActiveLine(),
				highlightSelectionMatches(),
				colorPicker,
				contourSelectionLayer,
				selectionClassTogglePlugin,
				editableCompartment.of([
					EditorState.readOnly.of(readOnly),
					EditorView.editable.of(!readOnly),
				]),
				EditorView.contentAttributes.of({
					spellcheck: "false",
				}),
				keymap.of([
					indentWithTab,
					...defaultKeymap,
					...historyKeymap,
					...searchKeymap,
					...foldKeymap,
				]),
				editorActionKeymap,
				themeCompartment.of([
					getCodeSyntaxHighlighting(activeTheme),
					createCodeMirrorTheme(
						activeTheme,
						{ fontFamily: editorFontFamily, fontSize: editorFontSize },
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
			notifySelectionChange.cancel();
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

		// finally guarantees the flag resets even if dispatch throws.
		isExternalUpdateRef.current = true;
		try {
			view.dispatch({
				changes: {
					from: 0,
					to: view.state.doc.length,
					insert: value,
				},
			});
		} finally {
			isExternalUpdateRef.current = false;
		}
	}, [value]);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;

		view.dispatch({
			effects: themeCompartment.reconfigure([
				getCodeSyntaxHighlighting(activeTheme),
				createCodeMirrorTheme(
					activeTheme,
					{ fontFamily: editorFontFamily, fontSize: editorFontSize },
					fillHeight,
				),
			]),
		});
	}, [
		activeTheme,
		editorFontFamily,
		editorFontSize,
		fillHeight,
		themeCompartment,
	]);

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
