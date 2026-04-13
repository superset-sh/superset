import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { getChunks, MergeView } from "@codemirror/merge";
import {
	closeSearchPanel,
	getSearchQuery,
	highlightSelectionMatches,
	openSearchPanel,
	findNext as runFindNext,
	findPrevious as runFindPrevious,
	SearchQuery,
	search,
	searchKeymap,
	setSearchQuery,
} from "@codemirror/search";
import {
	Compartment,
	type EditorSelection,
	EditorState,
} from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	drawSelection,
	EditorView,
	highlightSpecialChars,
	keymap,
	lineNumbers,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import { useEffect, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { CodeEditorSearchOverlay } from "renderer/screens/main/components/WorkspaceView/components/CodeEditor/components/CodeEditorSearchOverlay";
import {
	type BlameEntry,
	createBlamePlugin,
} from "renderer/screens/main/components/WorkspaceView/components/CodeEditor/createBlamePlugin";
import { createCodeMirrorTheme } from "renderer/screens/main/components/WorkspaceView/components/CodeEditor/createCodeMirrorTheme";
import {
	createInlineCompletionPlugin,
	type InlineCompletionRequest,
} from "renderer/screens/main/components/WorkspaceView/components/CodeEditor/createInlineCompletionPlugin";
import {
	createSymbolInteractions,
	type SymbolHoverResult,
	type SymbolPosition,
} from "renderer/screens/main/components/WorkspaceView/components/CodeEditor/createSymbolInteractions";
import { loadLanguageSupport } from "renderer/screens/main/components/WorkspaceView/components/CodeEditor/loadLanguageSupport";
import { getCodeSyntaxHighlighting } from "renderer/screens/main/components/WorkspaceView/utils/code-theme";
import { useResolvedTheme } from "renderer/stores/theme";
import type { DiffViewMode } from "shared/changes-types";
import { getEditorTheme } from "shared/themes";

const SEARCH_MATCH_LIMIT = 10_000;

/**
 * See comment in CodeEditor.tsx — `display: none` on the panel DOM causes
 * `PanelGroup.scrollMargin()` to return a value equal to the full scroller
 * height, which in turn breaks CM's drag-select autoscroll (it fires
 * unconditionally because the computed bottom edge is at 0). Keep the
 * panel in flow but collapsed to zero height.
 */
function hideHiddenSearchPanelContainer(container: HTMLElement) {
	container.style.height = "0px";
	container.style.minHeight = "0px";
	container.style.maxHeight = "0px";
	container.style.margin = "0";
	container.style.padding = "0";
	container.style.border = "0";
	container.style.overflow = "hidden";
	container.style.visibility = "hidden";
	container.style.pointerEvents = "none";
}

function createHiddenSearchPanel() {
	const dom = document.createElement("div");
	dom.className = "cm-search cm-hidden-search-panel";
	dom.style.height = "0px";
	dom.style.overflow = "hidden";
	dom.style.visibility = "hidden";
	dom.style.pointerEvents = "none";

	return {
		dom,
		mount() {
			const panelContainer = dom.parentElement;
			if (panelContainer instanceof HTMLElement) {
				hideHiddenSearchPanelContainer(panelContainer);
			}
		},
	};
}

function getActiveSearchMatchIndex(
	matches: Array<{ from: number; to: number }>,
	selection: EditorSelection["main"],
) {
	if (matches.length === 0) return -1;

	const exactMatchIndex = matches.findIndex(
		(match) => match.from === selection.from && match.to === selection.to,
	);
	if (exactMatchIndex >= 0) return exactMatchIndex;

	const containingMatchIndex = matches.findIndex(
		(match) => selection.from >= match.from && selection.from <= match.to,
	);
	if (containingMatchIndex >= 0) return containingMatchIndex;

	const nextMatchIndex = matches.findIndex(
		(match) => match.from >= selection.from,
	);
	return nextMatchIndex >= 0 ? nextMatchIndex : 0;
}

// Line decoration that suppresses inline cm-changedText highlights
const suppressLineDeco = Decoration.line({ class: "cm-suppress-inline-diff" });

/**
 * Build a ViewPlugin that suppresses inline diff highlights on pure-insertion
 * (side="b") or pure-deletion (side="a") lines, matching VSCode behavior.
 * isPureChange(change) should return true when the change has no counterpart
 * on the opposite side.
 */
function makeSuppressPlugin(
	_side: "a" | "b",
	isPureChange: (change: {
		fromA: number;
		toA: number;
		fromB: number;
		toB: number;
	}) => boolean,
	absFrom: (
		chunk: { fromA: number; fromB: number },
		change: { fromA: number; fromB: number },
	) => number,
	absTo: (
		chunk: { fromA: number; fromB: number },
		change: { toA: number; toB: number },
	) => number,
) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet = Decoration.none;

			constructor(view: EditorView) {
				this.decorations = this.buildDecorations(view);
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged) {
					this.decorations = this.buildDecorations(update.view);
				}
			}

			buildDecorations(view: EditorView): DecorationSet {
				const result = getChunks(view.state);
				if (!result) return Decoration.none;

				const doc = view.state.doc;
				const lineFroms = new Set<number>();

				for (const chunk of result.chunks) {
					for (const change of chunk.changes) {
						if (!isPureChange(change)) continue;

						const from = absFrom(chunk, change);
						const to = absTo(chunk, change);
						if (from >= to) continue;

						let pos = from;
						while (pos < to) {
							const line = doc.lineAt(pos);
							lineFroms.add(line.from);
							pos = line.to + 1;
						}
					}
				}

				if (lineFroms.size === 0) return Decoration.none;

				const sorted = [...lineFroms].sort((a, b) => a - b);
				return Decoration.set(
					sorted.map((from) => suppressLineDeco.range(from)),
				);
			}
		},
		{ decorations: (v) => v.decorations },
	);
}

// b side: suppress pure insertions (no A counterpart)
const suppressInsertions = makeSuppressPlugin(
	"b",
	(change) => change.fromA === change.toA,
	(chunk, change) => chunk.fromB + change.fromB,
	(chunk, change) => chunk.fromB + change.toB,
);

// a side: suppress pure deletions (no B counterpart)
const suppressDeletions = makeSuppressPlugin(
	"a",
	(change) => change.fromB === change.toB,
	(chunk, change) => chunk.fromA + change.fromA,
	(chunk, change) => chunk.fromA + change.toA,
);

interface CodeMirrorDiffViewerProps {
	original: string;
	modified: string;
	language: string;
	worktreePath?: string;
	viewMode: DiffViewMode;
	onChange?: (value: string) => void;
	onSave?: () => void;
	blameEntries?: BlameEntry[];
	diagnostics?: Array<{
		line: number | null;
		column: number | null;
		endLine: number | null;
		endColumn: number | null;
		severity: "error" | "warning" | "info" | "hint";
	}>;
	inlineCompletionRequest?: InlineCompletionRequest | null;
	resolveSymbolHover?: (
		position: SymbolPosition,
	) => Promise<SymbolHoverResult | null> | SymbolHoverResult | null;
	onGoToDefinition?: (position: SymbolPosition) => Promise<void> | void;
	onModifiedCursorChange?: (position: SymbolPosition | null) => void;
}

function createDiagnosticsTheme(theme: ReturnType<typeof getEditorTheme>) {
	return EditorView.theme({
		".cm-problem-underline-error": {
			textDecoration: `underline wavy ${theme.colors.deletion}`,
			textUnderlineOffset: "3px",
			textDecorationThickness: "1.5px",
		},
		".cm-problem-underline-warning": {
			textDecoration: `underline wavy ${theme.colors.modified}`,
			textUnderlineOffset: "3px",
			textDecorationThickness: "1.5px",
		},
		".cm-problem-underline-info, .cm-problem-underline-hint": {
			textDecoration: `underline dotted ${theme.colors.searchActive}`,
			textUnderlineOffset: "3px",
			textDecorationThickness: "1.5px",
		},
	});
}

function buildDiagnosticDecorations(
	doc: EditorState["doc"],
	diagnostics: NonNullable<CodeMirrorDiffViewerProps["diagnostics"]>,
) {
	const decorations = diagnostics
		.filter((diagnostic) => diagnostic.line !== null)
		.map((diagnostic) => {
			const startLine = Math.max(1, Math.min(diagnostic.line ?? 1, doc.lines));
			const startLineInfo = doc.line(startLine);
			const startOffset = Math.max(0, (diagnostic.column ?? 1) - 1);
			const from = Math.min(startLineInfo.from + startOffset, startLineInfo.to);

			const endLineNumber = Math.max(
				startLine,
				Math.min(diagnostic.endLine ?? startLine, doc.lines),
			);
			const endLineInfo = doc.line(endLineNumber);
			const endOffset = Math.max(
				0,
				(diagnostic.endColumn ??
					(diagnostic.column !== null ? diagnostic.column + 1 : 2)) - 1,
			);
			let to = Math.min(endLineInfo.from + endOffset, endLineInfo.to);

			if (to <= from) {
				to = Math.min(from + 1, startLineInfo.to);
			}

			if (to <= from) {
				return null;
			}

			return Decoration.mark({
				class: `cm-problem-underline-${diagnostic.severity}`,
			}).range(from, to);
		})
		.filter((decoration) => decoration !== null);

	return Decoration.set(decorations, true);
}

export function CodeMirrorDiffViewer({
	original,
	modified,
	language,
	worktreePath,
	viewMode,
	onChange,
	onSave,
	blameEntries,
	diagnostics = [],
	inlineCompletionRequest,
	resolveSymbolHover,
	onGoToDefinition,
	onModifiedCursorChange,
}: CodeMirrorDiffViewerProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const mergeViewRef = useRef<MergeView | null>(null);
	const activeEditorRef = useRef<EditorView | null>(null);
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [searchQueryText, setSearchQueryText] = useState("");
	const [isCaseSensitive, setIsCaseSensitive] = useState(false);
	const [isRegexp, setIsRegexp] = useState(false);
	const [isWholeWord, setIsWholeWord] = useState(false);
	const [searchMatchCount, setSearchMatchCount] = useState(0);
	const [activeSearchMatchIndex, setActiveSearchMatchIndex] = useState(-1);
	const isSearchOpenRef = useRef(false);
	const syncSearchOverlayStateRef = useRef<(() => void) | null>(null);
	isSearchOpenRef.current = isSearchOpen;
	const langCompartmentA = useRef(new Compartment()).current;
	const langCompartmentB = useRef(new Compartment()).current;
	const themeCompartmentA = useRef(new Compartment()).current;
	const themeCompartmentB = useRef(new Compartment()).current;
	const blameCompartmentB = useRef(new Compartment()).current;
	const diagnosticsCompartmentB = useRef(new Compartment()).current;
	const inlineCompletionCompartmentB = useRef(new Compartment()).current;
	const onChangeRef = useRef(onChange);
	const onSaveRef = useRef(onSave);
	const inlineCompletionRequestRef = useRef(inlineCompletionRequest);
	const resolveSymbolHoverRef = useRef(resolveSymbolHover);
	const onGoToDefinitionRef = useRef(onGoToDefinition);
	const onModifiedCursorChangeRef = useRef(onModifiedCursorChange);
	const activeTheme = useResolvedTheme();
	const { data: fontSettings } = electronTrpc.settings.getFontSettings.useQuery(
		undefined,
		{ staleTime: 30_000 },
	);
	const editorFontFamily = fontSettings?.editorFontFamily ?? undefined;
	const editorFontSize = fontSettings?.editorFontSize ?? undefined;
	const editorTheme = getEditorTheme(activeTheme);

	onChangeRef.current = onChange;
	onSaveRef.current = onSave;
	inlineCompletionRequestRef.current = inlineCompletionRequest;
	resolveSymbolHoverRef.current = resolveSymbolHover;
	onGoToDefinitionRef.current = onGoToDefinition;
	onModifiedCursorChangeRef.current = onModifiedCursorChange;

	const getActiveEditor = (): EditorView | null => {
		const mv = mergeViewRef.current;
		if (!mv) return null;
		return activeEditorRef.current ?? mv.b;
	};

	const forEachEditor = (fn: (view: EditorView) => void) => {
		const mv = mergeViewRef.current;
		if (!mv) return;
		fn(mv.a);
		fn(mv.b);
	};

	const syncSearchOverlayState = () => {
		const view = getActiveEditor();
		if (!view) return;
		const query = getSearchQuery(view.state);
		const matches: Array<{ from: number; to: number }> = [];
		if (query.valid) {
			const cursor = query.getCursor(view.state);
			let nextMatch = cursor.next();
			while (!nextMatch.done) {
				if (matches.length >= SEARCH_MATCH_LIMIT) break;
				matches.push(nextMatch.value);
				nextMatch = cursor.next();
			}
		}
		setSearchQueryText(query.search);
		setIsCaseSensitive(query.caseSensitive);
		setIsRegexp(query.regexp);
		setIsWholeWord(query.wholeWord);
		setSearchMatchCount(matches.length);
		setActiveSearchMatchIndex(
			getActiveSearchMatchIndex(matches, view.state.selection.main),
		);
	};
	syncSearchOverlayStateRef.current = syncSearchOverlayState;

	const ensureOverlaySearchOpen = () => {
		const mv = mergeViewRef.current;
		if (!mv) return;
		// Open hidden panel on both editors so setSearchQuery effects are accepted.
		openSearchPanel(mv.a);
		openSearchPanel(mv.b);
		setIsSearchOpen(true);
		syncSearchOverlayState();
	};

	const updateOverlaySearchQuery = (
		overrides: Partial<{
			search: string;
			caseSensitive: boolean;
			regexp: boolean;
			wholeWord: boolean;
		}>,
	) => {
		const mv = mergeViewRef.current;
		if (!mv) return;
		openSearchPanel(mv.a);
		openSearchPanel(mv.b);
		const current = getSearchQuery((activeEditorRef.current ?? mv.b).state);
		const next = new SearchQuery({
			search: overrides.search ?? current.search,
			replace: current.replace,
			caseSensitive: overrides.caseSensitive ?? current.caseSensitive,
			regexp: overrides.regexp ?? current.regexp,
			wholeWord: overrides.wholeWord ?? current.wholeWord,
			literal: current.literal,
		});
		forEachEditor((view) => {
			view.dispatch({ effects: setSearchQuery.of(next) });
		});
		syncSearchOverlayState();
	};

	// Manual center scroll using CM's line-block cache — see CodeEditor.tsx
	// comment for the rationale (CM's y: "center" effect is unreliable on
	// virtualized content after a find dispatch).
	const scrollActiveSelectionToCenter = (view: EditorView) => {
		requestAnimationFrame(() => {
			const scroller = view.scrollDOM;
			const head = view.state.selection.main.head;
			const block = view.lineBlockAt(head);
			const targetScrollTop = Math.max(
				0,
				Math.round(block.top + block.height / 2 - scroller.clientHeight / 2),
			);
			scroller.scrollTop = targetScrollTop;
		});
	};

	const handleOverlayFindNext = () => {
		const view = getActiveEditor();
		if (!view) return;
		if (!getSearchQuery(view.state).search) {
			ensureOverlaySearchOpen();
			return;
		}
		runFindNext(view);
		scrollActiveSelectionToCenter(view);
	};

	const handleOverlayFindPrevious = () => {
		const view = getActiveEditor();
		if (!view) return;
		if (!getSearchQuery(view.state).search) {
			ensureOverlaySearchOpen();
			return;
		}
		runFindPrevious(view);
		scrollActiveSelectionToCenter(view);
	};

	const handleOverlaySearchClose = () => {
		forEachEditor((view) => {
			closeSearchPanel(view);
		});
		setIsSearchOpen(false);
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: MergeView is created once and destroyed on unmount
	useEffect(() => {
		if (!containerRef.current) return;

		const overlaySearchKeymap = keymap.of([
			{
				key: "Mod-f",
				run: () => {
					ensureOverlaySearchOpen();
					return true;
				},
			},
			{
				key: "F3",
				run: () => {
					handleOverlayFindNext();
					return true;
				},
				shift: () => {
					handleOverlayFindPrevious();
					return true;
				},
				preventDefault: true,
			},
			{
				key: "Mod-g",
				run: () => {
					handleOverlayFindNext();
					return true;
				},
				shift: () => {
					handleOverlayFindPrevious();
					return true;
				},
				preventDefault: true,
			},
			{
				key: "Escape",
				run: () => {
					if (!isSearchOpenRef.current) return false;
					handleOverlaySearchClose();
					return true;
				},
			},
		]);

		const focusTracker = EditorView.domEventHandlers({
			focus: (_event, view) => {
				activeEditorRef.current = view;
				// Re-sync overlay counts/ordinal against the newly focused editor.
				syncSearchOverlayStateRef.current?.();
			},
		});

		const overlaySearchUpdateListener = EditorView.updateListener.of(
			(update) => {
				if (
					!(
						update.docChanged ||
						update.selectionSet ||
						update.transactions.some((tr) =>
							tr.effects.some((effect) => effect.is(setSearchQuery)),
						)
					)
				) {
					return;
				}
				syncSearchOverlayStateRef.current?.();
			},
		);

		const searchExtension = search({ createPanel: createHiddenSearchPanel });

		const readOnlyExtensions = [
			lineNumbers(),
			highlightSpecialChars(),
			drawSelection(),
			highlightSelectionMatches(),
			EditorState.readOnly.of(true),
			EditorView.editable.of(false),
			EditorView.lineWrapping,
			searchExtension,
			focusTracker,
			overlaySearchUpdateListener,
			overlaySearchKeymap,
			keymap.of([indentWithTab, ...defaultKeymap, ...searchKeymap]),
			suppressDeletions,
		];

		const editableExtensions = [
			lineNumbers(),
			highlightSpecialChars(),
			drawSelection(),
			highlightSelectionMatches(),
			EditorView.lineWrapping,
			searchExtension,
			focusTracker,
			overlaySearchUpdateListener,
			overlaySearchKeymap,
			keymap.of([
				indentWithTab,
				...defaultKeymap,
				...searchKeymap,
				{
					key: "Mod-s",
					run: () => {
						onSaveRef.current?.();
						return true;
					},
				},
			]),
			inlineCompletionCompartmentB.of(
				inlineCompletionRequestRef.current
					? createInlineCompletionPlugin(
							(args, signal) =>
								inlineCompletionRequestRef.current?.(args, signal) ??
								Promise.resolve(null),
						)
					: [],
			),
			EditorView.updateListener.of((update) => {
				if (update.docChanged) {
					onChangeRef.current?.(update.state.doc.toString());
				}
			}),
			suppressInsertions,
			blameCompartmentB.of([]),
			...createSymbolInteractions({
				resolveHover: (position) =>
					resolveSymbolHoverRef.current?.(position) ?? null,
				onGoToDefinition: (position) => onGoToDefinitionRef.current?.(position),
				onCursorChange: (position) =>
					onModifiedCursorChangeRef.current?.(position),
			}),
		];

		const themeExts = [
			getCodeSyntaxHighlighting(activeTheme),
			createCodeMirrorTheme(
				activeTheme,
				{ fontFamily: editorFontFamily, fontSize: editorFontSize },
				true,
			),
		];

		const mergeView = new MergeView({
			parent: containerRef.current,
			collapseUnchanged: { margin: 3, minSize: 4 },
			diffConfig: { scanLimit: 50000, timeout: 5000 },
			revertControls: "a-to-b",
			a: {
				doc: original,
				extensions: [
					...readOnlyExtensions,
					themeCompartmentA.of(themeExts),
					langCompartmentA.of([]),
				],
			},
			b: {
				doc: modified,
				extensions: [
					...editableExtensions,
					themeCompartmentB.of(themeExts),
					langCompartmentB.of([]),
					diagnosticsCompartmentB.of([
						createDiagnosticsTheme(editorTheme),
						EditorView.decorations.of(
							buildDiagnosticDecorations(
								EditorState.create({ doc: modified }).doc,
								diagnostics,
							),
						),
					]),
				],
			},
		});

		mergeViewRef.current = mergeView;

		void loadLanguageSupport(language).then((ext) => {
			if (!ext || !mergeViewRef.current) return;
			const mv = mergeViewRef.current;
			mv.a.dispatch({ effects: langCompartmentA.reconfigure(ext) });
			mv.b.dispatch({ effects: langCompartmentB.reconfigure(ext) });
		});

		return () => {
			mergeView.destroy();
			mergeViewRef.current = null;
			// Reset search state so the overlay does not keep pointing at the
			// destroyed EditorView once the next MergeView instance is built.
			activeEditorRef.current = null;
			isSearchOpenRef.current = false;
			setIsSearchOpen(false);
			setSearchQueryText("");
			setSearchMatchCount(0);
			setActiveSearchMatchIndex(-1);
		};
	}, [original, modified, language, viewMode]);

	useEffect(() => {
		const mv = mergeViewRef.current;
		if (!mv) return;

		const themeExts = [
			getCodeSyntaxHighlighting(activeTheme),
			createCodeMirrorTheme(
				activeTheme,
				{ fontFamily: editorFontFamily, fontSize: editorFontSize },
				true,
			),
		];

		mv.a.dispatch({ effects: themeCompartmentA.reconfigure(themeExts) });
		mv.b.dispatch({ effects: themeCompartmentB.reconfigure(themeExts) });
	}, [
		activeTheme,
		editorFontFamily,
		editorFontSize,
		themeCompartmentA,
		themeCompartmentB,
	]);

	useEffect(() => {
		const mv = mergeViewRef.current;
		if (!mv) return;

		mv.b.dispatch({
			effects: diagnosticsCompartmentB.reconfigure([
				createDiagnosticsTheme(editorTheme),
				EditorView.decorations.of(
					buildDiagnosticDecorations(mv.b.state.doc, diagnostics),
				),
			]),
		});
	}, [diagnostics, diagnosticsCompartmentB, editorTheme]);

	useEffect(() => {
		const mv = mergeViewRef.current;
		if (!mv) return;

		mv.b.dispatch({
			effects: blameCompartmentB.reconfigure(
				blameEntries ? createBlamePlugin(blameEntries, { worktreePath }) : [],
			),
		});
	}, [blameEntries, blameCompartmentB, worktreePath]);

	const hasInlineCompletionRequest = Boolean(inlineCompletionRequest);
	useEffect(() => {
		const mv = mergeViewRef.current;
		if (!mv) return;

		mv.b.dispatch({
			effects: inlineCompletionCompartmentB.reconfigure(
				hasInlineCompletionRequest
					? createInlineCompletionPlugin(
							(args, signal) =>
								inlineCompletionRequestRef.current?.(args, signal) ??
								Promise.resolve(null),
						)
					: [],
			),
		});
	}, [inlineCompletionCompartmentB, hasInlineCompletionRequest]);

	return (
		<div className="relative h-full w-full">
			<div ref={containerRef} className="h-full w-full overflow-auto" />
			<CodeEditorSearchOverlay
				isOpen={isSearchOpen}
				query={searchQueryText}
				replaceText=""
				caseSensitive={isCaseSensitive}
				regexp={isRegexp}
				wholeWord={isWholeWord}
				matchCount={searchMatchCount}
				activeMatchIndex={activeSearchMatchIndex}
				readOnly
				onQueryChange={(nextQuery) => {
					updateOverlaySearchQuery({ search: nextQuery });
				}}
				onReplaceTextChange={() => {}}
				onCaseSensitiveChange={(next) => {
					updateOverlaySearchQuery({ caseSensitive: next });
				}}
				onRegexpChange={(next) => {
					updateOverlaySearchQuery({ regexp: next });
				}}
				onWholeWordChange={(next) => {
					updateOverlaySearchQuery({ wholeWord: next });
				}}
				onFindNext={handleOverlayFindNext}
				onFindPrevious={handleOverlayFindPrevious}
				onSelectAllMatches={() => {}}
				onReplaceNext={() => {}}
				onReplaceAll={() => {}}
				onClose={handleOverlaySearchClose}
			/>
		</div>
	);
}
