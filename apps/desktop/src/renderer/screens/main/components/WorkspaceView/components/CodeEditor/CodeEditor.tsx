import {
	defaultKeymap,
	history,
	historyKeymap,
	indentWithTab,
	selectAll,
} from "@codemirror/commands";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import {
	closeSearchPanel,
	getSearchQuery,
	highlightSelectionMatches,
	openSearchPanel,
	findNext as runFindNext,
	findPrevious as runFindPrevious,
	replaceAll as runReplaceAll,
	replaceNext as runReplaceNext,
	selectMatches as runSelectMatches,
	SearchQuery,
	search,
	searchKeymap,
	setSearchQuery,
} from "@codemirror/search";
import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
import {
	Decoration,
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
import { type MutableRefObject, useEffect, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { CodeEditorAdapter } from "renderer/screens/main/components/WorkspaceView/ContentView/components";
import { getCodeSyntaxHighlighting } from "renderer/screens/main/components/WorkspaceView/utils/code-theme";
import { useResolvedTheme } from "renderer/stores/theme";
import { getEditorTheme } from "shared/themes";
import { CodeEditorSearchOverlay } from "./components/CodeEditorSearchOverlay";
import { type BlameEntry, createBlamePlugin } from "./createBlamePlugin";
import { createCodeMirrorTheme } from "./createCodeMirrorTheme";
import { createIndentRainbowPlugin } from "./createIndentRainbowPlugin";
import {
	createInlineCompletionPlugin,
	type InlineCompletionRequest,
} from "./createInlineCompletionPlugin";
import {
	createSymbolInteractions,
	type SymbolHoverResult,
	type SymbolPosition,
} from "./createSymbolInteractions";
import { createTrailingSpacesPlugin } from "./createTrailingSpacesPlugin";
import { loadLanguageSupport } from "./loadLanguageSupport";

interface CodeEditorProps {
	value: string;
	language: string;
	worktreePath?: string;
	readOnly?: boolean;
	fillHeight?: boolean;
	className?: string;
	searchMode?: "native-panel" | "overlay";
	editorRef?: MutableRefObject<CodeEditorAdapter | null>;
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
}

const HIGHLIGHT_CLEAR_DELAY_MS = 1800;
const HIGHLIGHT_RETRY_DELAY_MS = 80;
const HIGHLIGHT_MAX_RETRIES = 8;
const SCROLL_STABILIZE_DELAY_MS = 120;
const SEARCH_MATCH_LIMIT = 10_000;

/**
 * Hidden search panel used when `searchMode === "overlay"`. The panel must
 * stay part of the CM layout — setting `display: none` on the panel DOM
 * makes `getBoundingClientRect()` return all-zeros, which breaks CM's
 * `PanelGroup.scrollMargin()` calculation (it ends up equal to the full
 * scroller height) and causes the drag-select autoscroll to fire
 * continuously anywhere inside the editor. Collapsing the panel to zero
 * height while keeping it in flow makes `top ≈ scroller.bottom` so
 * scrollMargin resolves to 0 as intended.
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
	if (matches.length === 0) {
		return -1;
	}

	const exactMatchIndex = matches.findIndex(
		(match) => match.from === selection.from && match.to === selection.to,
	);
	if (exactMatchIndex >= 0) {
		return exactMatchIndex;
	}

	const containingMatchIndex = matches.findIndex(
		(match) => selection.from >= match.from && selection.from <= match.to,
	);
	if (containingMatchIndex >= 0) {
		return containingMatchIndex;
	}

	const nextMatchIndex = matches.findIndex(
		(match) => match.from >= selection.from,
	);
	return nextMatchIndex >= 0 ? nextMatchIndex : 0;
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
	diagnostics: NonNullable<CodeEditorProps["diagnostics"]>,
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

function createCodeMirrorAdapter(
	view: EditorView,
	jumpHighlightStyle: {
		backgroundColor: string;
		boxShadow: string;
	},
	searchControlsRef: MutableRefObject<{
		openFind: () => void;
	} | null>,
): CodeEditorAdapter {
	let disposed = false;
	let highlightResetTimeout: ReturnType<typeof setTimeout> | null = null;
	let scrollStabilizeTimeout: ReturnType<typeof setTimeout> | null = null;
	let highlightRequestId = 0;
	let highlightedLine: HTMLElement | null = null;
	let highlightAnimation: Animation | null = null;
	let highlightedLinePreviousStyle: {
		backgroundColor: string;
		boxShadow: string;
		outline: string;
		outlineOffset: string;
		borderRadius: string;
		transition: string;
	} | null = null;
	const pendingHighlightTimeouts = new Set<number>();

	const clearPendingHighlightTimeouts = () => {
		for (const timeoutId of pendingHighlightTimeouts) {
			window.clearTimeout(timeoutId);
		}
		pendingHighlightTimeouts.clear();
	};

	const clearLineHighlight = () => {
		if (!highlightedLine) {
			return;
		}

		if (highlightedLinePreviousStyle) {
			highlightedLine.style.backgroundColor =
				highlightedLinePreviousStyle.backgroundColor;
			highlightedLine.style.boxShadow = highlightedLinePreviousStyle.boxShadow;
			highlightedLine.style.outline = highlightedLinePreviousStyle.outline;
			highlightedLine.style.outlineOffset =
				highlightedLinePreviousStyle.outlineOffset;
			highlightedLine.style.borderRadius =
				highlightedLinePreviousStyle.borderRadius;
			highlightedLine.style.transition =
				highlightedLinePreviousStyle.transition;
		} else {
			highlightedLine.style.removeProperty("background-color");
			highlightedLine.style.removeProperty("box-shadow");
			highlightedLine.style.removeProperty("outline");
			highlightedLine.style.removeProperty("outline-offset");
			highlightedLine.style.removeProperty("border-radius");
			highlightedLine.style.removeProperty("transition");
		}

		highlightAnimation?.cancel();
		highlightAnimation = null;
		highlightedLine = null;
		highlightedLinePreviousStyle = null;
	};

	const highlightLineAt = (anchor: number, requestId: number, attempt = 0) => {
		const timeoutId = window.setTimeout(
			() => {
				pendingHighlightTimeouts.delete(timeoutId);
				if (disposed || requestId !== highlightRequestId) {
					return;
				}

				const domAtPos = view.domAtPos(anchor);
				const domNode =
					domAtPos.node instanceof HTMLElement
						? domAtPos.node
						: domAtPos.node.parentElement;
				const lineElement = domNode?.closest(".cm-line");
				if (!(lineElement instanceof HTMLElement)) {
					if (attempt < HIGHLIGHT_MAX_RETRIES) {
						highlightLineAt(anchor, requestId, attempt + 1);
					}
					return;
				}

				clearLineHighlight();
				highlightedLinePreviousStyle = {
					backgroundColor: lineElement.style.backgroundColor,
					boxShadow: lineElement.style.boxShadow,
					outline: lineElement.style.outline,
					outlineOffset: lineElement.style.outlineOffset,
					borderRadius: lineElement.style.borderRadius,
					transition: lineElement.style.transition,
				};
				lineElement.style.transition =
					"background-color 1.2s ease-out, box-shadow 1.2s ease-out, outline-color 1.2s ease-out";
				lineElement.style.backgroundColor = jumpHighlightStyle.backgroundColor;
				lineElement.style.boxShadow = jumpHighlightStyle.boxShadow;
				lineElement.style.outline = `2px solid ${jumpHighlightStyle.backgroundColor}`;
				lineElement.style.outlineOffset = "-1px";
				lineElement.style.borderRadius = "4px";
				highlightedLine = lineElement;
				highlightAnimation = lineElement.animate(
					[
						{
							backgroundColor: jumpHighlightStyle.backgroundColor,
							boxShadow: jumpHighlightStyle.boxShadow,
							outlineColor: jumpHighlightStyle.backgroundColor,
						},
						{
							backgroundColor: jumpHighlightStyle.backgroundColor,
							boxShadow: jumpHighlightStyle.boxShadow,
							outlineColor: jumpHighlightStyle.backgroundColor,
							offset: 0.35,
						},
						{
							backgroundColor:
								highlightedLinePreviousStyle?.backgroundColor || "transparent",
							boxShadow: highlightedLinePreviousStyle?.boxShadow || "none",
							outlineColor: "transparent",
						},
					],
					{
						duration: HIGHLIGHT_CLEAR_DELAY_MS,
						easing: "ease-out",
						fill: "forwards",
					},
				);
			},
			attempt === 0 ? 32 : HIGHLIGHT_RETRY_DELAY_MS,
		);
		pendingHighlightTimeouts.add(timeoutId);
	};

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

			if (highlightResetTimeout) {
				clearTimeout(highlightResetTimeout);
				highlightResetTimeout = null;
			}

			view.dispatch({
				selection: EditorSelection.cursor(anchor),
				effects: EditorView.scrollIntoView(anchor, {
					y: "center",
					yMargin: 48,
				}),
			});
			highlightRequestId += 1;
			const currentHighlightRequestId = highlightRequestId;
			clearPendingHighlightTimeouts();
			highlightLineAt(anchor, currentHighlightRequestId);
			if (scrollStabilizeTimeout) {
				clearTimeout(scrollStabilizeTimeout);
			}
			scrollStabilizeTimeout = setTimeout(() => {
				if (disposed) {
					return;
				}

				view.dispatch({
					effects: EditorView.scrollIntoView(anchor, {
						y: "center",
						yMargin: 48,
					}),
				});
				scrollStabilizeTimeout = null;
			}, SCROLL_STABILIZE_DELAY_MS);

			highlightResetTimeout = setTimeout(() => {
				if (disposed || currentHighlightRequestId !== highlightRequestId) {
					return;
				}

				clearLineHighlight();
				highlightResetTimeout = null;
			}, HIGHLIGHT_CLEAR_DELAY_MS);

			view.focus();
		},
		getSelectionLines() {
			const selection = view.state.selection.main;
			const startLine = view.state.doc.lineAt(selection.from).number;
			const endLine = view.state.doc.lineAt(selection.to).number;
			return { startLine, endLine };
		},
		getCursorPosition() {
			const cursor = view.state.selection.main.head;
			const line = view.state.doc.lineAt(cursor);
			return { line: line.number, column: cursor - line.from + 1 };
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
			searchControlsRef.current?.openFind();
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			if (highlightResetTimeout) {
				clearTimeout(highlightResetTimeout);
				highlightResetTimeout = null;
			}
			if (scrollStabilizeTimeout) {
				clearTimeout(scrollStabilizeTimeout);
				scrollStabilizeTimeout = null;
			}
			clearPendingHighlightTimeouts();
			clearLineHighlight();
			view.destroy();
		},
	};
}

export function CodeEditor({
	value,
	language,
	worktreePath,
	readOnly = false,
	fillHeight = true,
	className,
	searchMode = "native-panel",
	editorRef,
	onChange,
	onSave,
	blameEntries,
	diagnostics = [],
	inlineCompletionRequest = null,
	resolveSymbolHover,
	onGoToDefinition,
}: CodeEditorProps) {
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [searchQuery, setSearchQueryState] = useState("");
	const [replaceQuery, setReplaceQueryState] = useState("");
	const [isCaseSensitive, setIsCaseSensitiveState] = useState(false);
	const [isRegexp, setIsRegexpState] = useState(false);
	const [isWholeWord, setIsWholeWordState] = useState(false);
	const [searchMatchCount, setSearchMatchCount] = useState(0);
	const [activeSearchMatchIndex, setActiveSearchMatchIndex] = useState(-1);
	const isSearchOpenRef = useRef(false);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const languageCompartment = useRef(new Compartment()).current;
	const themeCompartment = useRef(new Compartment()).current;
	const editableCompartment = useRef(new Compartment()).current;
	const blameCompartment = useRef(new Compartment()).current;
	const indentRainbowCompartment = useRef(new Compartment()).current;
	const trailingSpacesCompartment = useRef(new Compartment()).current;
	const diagnosticsCompartment = useRef(new Compartment()).current;
	const searchModeRef = useRef(searchMode);
	const onChangeRef = useRef(onChange);
	const onSaveRef = useRef(onSave);
	const searchControlsRef = useRef<{
		openFind: () => void;
	} | null>(null);
	const syncSearchOverlayStateRef = useRef<(() => void) | null>(null);
	const inlineCompletionRequestRef = useRef<InlineCompletionRequest | null>(
		inlineCompletionRequest,
	);
	const resolveSymbolHoverRef = useRef(resolveSymbolHover);
	const onGoToDefinitionRef = useRef(onGoToDefinition);
	// Guards against re-entrant onChange calls triggered by the value-sync effect's own dispatch.
	const isExternalUpdateRef = useRef(false);
	const { data: fontSettings } = electronTrpc.settings.getFontSettings.useQuery(
		undefined,
		{
			staleTime: 30_000,
		},
	);
	const { data: indentRainbow } =
		electronTrpc.settings.getIndentRainbow.useQuery(undefined, {
			staleTime: 30_000,
		});
	const { data: trailingSpaces } =
		electronTrpc.settings.getTrailingSpaces.useQuery(undefined, {
			staleTime: 30_000,
		});
	const editorFontFamily = fontSettings?.editorFontFamily ?? undefined;
	const editorFontSize = fontSettings?.editorFontSize ?? undefined;
	const activeTheme = useResolvedTheme();
	const editorTheme = getEditorTheme(activeTheme);
	const inlineCompletionCompartment = useRef(new Compartment()).current;

	onChangeRef.current = onChange;
	onSaveRef.current = onSave;
	inlineCompletionRequestRef.current = inlineCompletionRequest;
	resolveSymbolHoverRef.current = resolveSymbolHover;
	onGoToDefinitionRef.current = onGoToDefinition;
	searchModeRef.current = searchMode;
	isSearchOpenRef.current = isSearchOpen;

	const syncSearchOverlayState = () => {
		const view = viewRef.current;
		if (!view || searchModeRef.current !== "overlay") {
			return;
		}

		const query = getSearchQuery(view.state);
		const matches: Array<{ from: number; to: number }> = [];
		if (query.valid) {
			const cursor = query.getCursor(view.state);
			let nextMatch = cursor.next();
			while (!nextMatch.done) {
				if (matches.length >= SEARCH_MATCH_LIMIT) {
					break;
				}
				matches.push(nextMatch.value);
				nextMatch = cursor.next();
			}
		}

		setSearchQueryState(query.search);
		setReplaceQueryState(query.replace);
		setIsCaseSensitiveState(query.caseSensitive);
		setIsRegexpState(query.regexp);
		setIsWholeWordState(query.wholeWord);
		setSearchMatchCount(matches.length);
		setActiveSearchMatchIndex(
			getActiveSearchMatchIndex(matches, view.state.selection.main),
		);
	};

	syncSearchOverlayStateRef.current = syncSearchOverlayState;

	const ensureOverlaySearchOpen = () => {
		const view = viewRef.current;
		if (!view) {
			return;
		}

		if (searchModeRef.current === "overlay") {
			openSearchPanel(view);
			setIsSearchOpen(true);
			syncSearchOverlayState();
			return;
		}

		openSearchPanel(view);
	};

	const updateOverlaySearchQuery = (
		overrides: Partial<{
			search: string;
			replace: string;
			caseSensitive: boolean;
			regexp: boolean;
			wholeWord: boolean;
		}>,
	) => {
		const view = viewRef.current;
		if (!view) {
			return;
		}

		openSearchPanel(view);
		const currentQuery = getSearchQuery(view.state);
		const nextQuery = new SearchQuery({
			search: overrides.search ?? currentQuery.search,
			replace: overrides.replace ?? currentQuery.replace,
			caseSensitive: overrides.caseSensitive ?? currentQuery.caseSensitive,
			regexp: overrides.regexp ?? currentQuery.regexp,
			wholeWord: overrides.wholeWord ?? currentQuery.wholeWord,
			literal: currentQuery.literal,
		});
		view.dispatch({
			effects: setSearchQuery.of(nextQuery),
		});
		syncSearchOverlayState();
	};

	const handleOverlaySearchClose = () => {
		const view = viewRef.current;
		if (view) {
			closeSearchPanel(view);
		}
		setIsSearchOpen(false);
	};

	// CM's find commands dispatch `scrollIntoView: true` (→ y: "nearest")
	// synchronously. Following that up with a `y: "center"` effect is
	// unreliable on huge virtualized files because `coordsAtPos` for an
	// un-rendered line returns estimated coords and CM's internal scroll
	// math ends up a near-noop. Instead, wait one frame for CM to apply
	// its nearest scroll, then read the line block (which uses CM's own
	// doc-relative line-height cache kept accurate by the measure cycle)
	// and set `scrollTop` directly.
	const scrollSearchMatchToCenter = (view: EditorView) => {
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
		const view = viewRef.current;
		if (!view) {
			return;
		}

		if (!getSearchQuery(view.state).search) {
			ensureOverlaySearchOpen();
			return;
		}

		runFindNext(view);
		scrollSearchMatchToCenter(view);
	};

	const handleOverlayFindPrevious = () => {
		const view = viewRef.current;
		if (!view) {
			return;
		}

		if (!getSearchQuery(view.state).search) {
			ensureOverlaySearchOpen();
			return;
		}

		runFindPrevious(view);
		scrollSearchMatchToCenter(view);
	};

	searchControlsRef.current = {
		openFind: ensureOverlaySearchOpen,
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: Editor instance is created once and reconfigured via dedicated effects below
	useEffect(() => {
		if (!containerRef.current) return;

		const updateListener = EditorView.updateListener.of((update) => {
			if (!update.docChanged) return;
			if (isExternalUpdateRef.current) return;
			onChangeRef.current?.(update.state.doc.toString());
		});

		const overlaySearchUpdateListener = EditorView.updateListener.of(
			(update) => {
				if (
					searchModeRef.current !== "overlay" ||
					!(
						update.docChanged ||
						update.selectionSet ||
						update.transactions.some((transaction) =>
							transaction.effects.some((effect) => effect.is(setSearchQuery)),
						)
					)
				) {
					return;
				}

				syncSearchOverlayStateRef.current?.();
			},
		);

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
				search(
					searchMode === "overlay"
						? { createPanel: createHiddenSearchPanel }
						: undefined,
				),
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
					...(searchMode === "overlay"
						? [
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
										if (!isSearchOpenRef.current) {
											return false;
										}
										handleOverlaySearchClose();
										return true;
									},
								},
							]
						: []),
					indentWithTab,
					...defaultKeymap,
					...historyKeymap,
					...searchKeymap,
				]),
				saveKeymap,
				inlineCompletionCompartment.of(
					inlineCompletionRequestRef.current
						? createInlineCompletionPlugin(
								(args, signal) =>
									inlineCompletionRequestRef.current?.(args, signal) ??
									Promise.resolve(null),
							)
						: [],
				),
				themeCompartment.of([
					getCodeSyntaxHighlighting(activeTheme),
					createCodeMirrorTheme(
						activeTheme,
						{
							fontFamily: editorFontFamily,
							fontSize: editorFontSize,
						},
						fillHeight,
					),
				]),
				languageCompartment.of([]),
				blameCompartment.of([]),
				indentRainbowCompartment.of([]),
				trailingSpacesCompartment.of([]),
				diagnosticsCompartment.of([
					createDiagnosticsTheme(editorTheme),
					EditorView.decorations.of(
						buildDiagnosticDecorations(
							EditorState.create({ doc: value }).doc,
							diagnostics,
						),
					),
				]),
				...createSymbolInteractions({
					resolveHover: (position) =>
						resolveSymbolHoverRef.current?.(position) ?? null,
					onGoToDefinition: (position) =>
						onGoToDefinitionRef.current?.(position),
				}),
				updateListener,
				overlaySearchUpdateListener,
			],
		});

		const view = new EditorView({
			state,
			parent: containerRef.current,
		});
		const adapter = createCodeMirrorAdapter(
			view,
			{
				backgroundColor: editorTheme.colors.search,
				boxShadow: `inset 2px 0 0 ${editorTheme.colors.searchActive}`,
			},
			searchControlsRef,
		);

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
					{
						fontFamily: editorFontFamily,
						fontSize: editorFontSize,
					},
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
			effects: diagnosticsCompartment.reconfigure([
				createDiagnosticsTheme(editorTheme),
				EditorView.decorations.of(
					buildDiagnosticDecorations(view.state.doc, diagnostics),
				),
			]),
		});
	}, [diagnostics, diagnosticsCompartment, editorTheme]);

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
		const view = viewRef.current;
		if (!view) return;

		view.dispatch({
			effects: indentRainbowCompartment.reconfigure(
				indentRainbow?.enabled
					? createIndentRainbowPlugin(indentRainbow.colors)
					: [],
			),
		});
	}, [indentRainbow?.enabled, indentRainbow?.colors, indentRainbowCompartment]);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;

		view.dispatch({
			effects: trailingSpacesCompartment.reconfigure(
				trailingSpaces?.enabled
					? createTrailingSpacesPlugin(trailingSpaces.color)
					: [],
			),
		});
	}, [
		trailingSpaces?.enabled,
		trailingSpaces?.color,
		trailingSpacesCompartment,
	]);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;

		view.dispatch({
			effects: blameCompartment.reconfigure(
				blameEntries ? createBlamePlugin(blameEntries, { worktreePath }) : [],
			),
		});
	}, [blameEntries, blameCompartment, worktreePath]);

	const hasInlineCompletionRequest = Boolean(inlineCompletionRequest);
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;

		view.dispatch({
			effects: inlineCompletionCompartment.reconfigure(
				hasInlineCompletionRequest
					? createInlineCompletionPlugin(
							(args, signal) =>
								inlineCompletionRequestRef.current?.(args, signal) ??
								Promise.resolve(null),
						)
					: [],
			),
		});
	}, [inlineCompletionCompartment, hasInlineCompletionRequest]);

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

	useEffect(() => {
		if (searchMode !== "overlay") {
			setIsSearchOpen(false);
			return;
		}

		syncSearchOverlayStateRef.current?.();
	}, [searchMode]);

	return (
		<div
			className={cn(
				"relative min-w-0",
				fillHeight ? "h-full w-full" : "w-full",
				className,
			)}
		>
			<div
				ref={containerRef}
				className={cn(fillHeight ? "h-full w-full" : "w-full")}
			/>
			{searchMode === "overlay" ? (
				<CodeEditorSearchOverlay
					isOpen={isSearchOpen}
					query={searchQuery}
					replaceText={replaceQuery}
					caseSensitive={isCaseSensitive}
					regexp={isRegexp}
					wholeWord={isWholeWord}
					matchCount={searchMatchCount}
					activeMatchIndex={activeSearchMatchIndex}
					readOnly={readOnly}
					onQueryChange={(nextQuery) => {
						updateOverlaySearchQuery({ search: nextQuery });
					}}
					onReplaceTextChange={(nextReplaceText) => {
						updateOverlaySearchQuery({ replace: nextReplaceText });
					}}
					onCaseSensitiveChange={(nextCaseSensitive) => {
						updateOverlaySearchQuery({ caseSensitive: nextCaseSensitive });
					}}
					onRegexpChange={(nextRegexp) => {
						updateOverlaySearchQuery({ regexp: nextRegexp });
					}}
					onWholeWordChange={(nextWholeWord) => {
						updateOverlaySearchQuery({ wholeWord: nextWholeWord });
					}}
					onFindNext={handleOverlayFindNext}
					onFindPrevious={handleOverlayFindPrevious}
					onSelectAllMatches={() => {
						const view = viewRef.current;
						if (!view) {
							return;
						}

						if (!getSearchQuery(view.state).search) {
							ensureOverlaySearchOpen();
							return;
						}

						runSelectMatches(view);
					}}
					onReplaceNext={() => {
						const view = viewRef.current;
						if (!view || readOnly) {
							return;
						}

						if (!getSearchQuery(view.state).search) {
							ensureOverlaySearchOpen();
							return;
						}

						runReplaceNext(view);
					}}
					onReplaceAll={() => {
						const view = viewRef.current;
						if (!view || readOnly) {
							return;
						}

						if (!getSearchQuery(view.state).search) {
							ensureOverlaySearchOpen();
							return;
						}

						runReplaceAll(view);
					}}
					onClose={handleOverlaySearchClose}
				/>
			) : null}
		</div>
	);
}
