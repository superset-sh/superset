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
import { type MutableRefObject, useEffect, useRef } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useResolvedTheme } from "renderer/stores/theme";
import {
	type CodeEditorAdapter,
	createCodeMirrorAdapter,
} from "./CodeEditorAdapter";
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
	initialScrollPosition?: { scrollTop: number; scrollLeft: number };
	onScrollPositionChange?: (position: {
		scrollTop: number;
		scrollLeft: number;
	}) => void;
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
	initialScrollPosition,
	onScrollPositionChange,
}: CodeEditorProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const languageCompartment = useRef(new Compartment()).current;
	const themeCompartment = useRef(new Compartment()).current;
	const editableCompartment = useRef(new Compartment()).current;
	const onChangeRef = useRef(onChange);
	const onSaveRef = useRef(onSave);
	const onScrollPositionChangeRef = useRef(onScrollPositionChange);
	const initialScrollPositionRef = useRef(initialScrollPosition);
	// Guards against re-entrant onChange calls triggered by the value-sync effect's own dispatch.
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
	onScrollPositionChangeRef.current = onScrollPositionChange;

	// biome-ignore lint/correctness/useExhaustiveDependencies: Editor instance is created once and reconfigured via dedicated effects below
	useEffect(() => {
		if (!containerRef.current) return;

		const updateListener = EditorView.updateListener.of((update) => {
			if (!update.docChanged) return;
			if (isExternalUpdateRef.current) return;
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
				saveKeymap,
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
		const reportScrollPosition = () => {
			onScrollPositionChangeRef.current?.({
				scrollTop: view.scrollDOM.scrollTop,
				scrollLeft: view.scrollDOM.scrollLeft,
			});
		};
		view.scrollDOM.addEventListener("scroll", reportScrollPosition, {
			passive: true,
		});
		const savedScrollPosition = initialScrollPositionRef.current;
		if (savedScrollPosition) {
			view.requestMeasure({
				read: () => savedScrollPosition,
				write: (position) => {
					view.scrollDOM.scrollTop = position.scrollTop;
					view.scrollDOM.scrollLeft = position.scrollLeft;
				},
			});
		}

		viewRef.current = view;
		if (editorRef) {
			editorRef.current = adapter;
		}

		return () => {
			// The passive effect cleanup can run after the editor DOM has been
			// detached and its scroll offset clamped to zero. The scroll listener
			// already saved the last real position, so do not overwrite it here.
			view.scrollDOM.removeEventListener("scroll", reportScrollPosition);
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

		// Guarantee flag reset regardless of whether dispatch throws (e.g. view destroyed between null-check and dispatch).
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
