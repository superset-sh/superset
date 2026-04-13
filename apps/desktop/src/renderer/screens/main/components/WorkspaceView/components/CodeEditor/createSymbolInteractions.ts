import type { Extension, Text } from "@codemirror/state";
import {
	EditorView,
	hoverTooltip,
	keymap,
	type Tooltip,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";

export interface SymbolPosition {
	line: number;
	column: number;
}

export interface SymbolRange {
	line: number;
	column: number;
	endLine: number;
	endColumn: number;
}

export interface SymbolMarkupContent {
	kind: "plaintext" | "markdown";
	value: string;
}

export interface SymbolHoverResult {
	contents: SymbolMarkupContent[];
	range: SymbolRange | null;
}

interface CreateSymbolInteractionsOptions {
	resolveHover?: (
		position: SymbolPosition,
	) => Promise<SymbolHoverResult | null> | SymbolHoverResult | null;
	onGoToDefinition?: (position: SymbolPosition) => Promise<void> | void;
	onCursorChange?: (position: SymbolPosition | null) => void;
}

function docOffsetToPosition(doc: Text, offset: number): SymbolPosition {
	const line = doc.lineAt(offset);
	return {
		line: line.number,
		column: offset - line.from + 1,
	};
}

function positionToDocOffset(doc: Text, position: SymbolPosition): number {
	const safeLine = Math.max(1, Math.min(position.line, doc.lines));
	const line = doc.line(safeLine);
	return Math.min(line.from + Math.max(position.column - 1, 0), line.to);
}

function rangeToOffsets(
	doc: Text,
	range: SymbolRange | null,
	fallbackOffset: number,
): { from: number; to: number } {
	if (!range) {
		return {
			from: fallbackOffset,
			to: Math.min(doc.length, fallbackOffset + 1),
		};
	}

	const from = positionToDocOffset(doc, {
		line: range.line,
		column: range.column,
	});
	const rawTo = positionToDocOffset(doc, {
		line: range.endLine,
		column: range.endColumn,
	});

	return {
		from,
		to: Math.min(doc.length, Math.max(from + 1, rawTo)),
	};
}

function createTooltipDom(contents: SymbolMarkupContent[]): HTMLElement {
	const dom = document.createElement("div");
	dom.style.maxWidth = "480px";
	dom.style.padding = "8px 10px";
	dom.style.borderRadius = "8px";
	dom.style.border = "1px solid hsl(var(--border))";
	dom.style.background = "hsl(var(--popover))";
	dom.style.color = "hsl(var(--popover-foreground))";
	dom.style.boxShadow =
		"0 10px 30px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.12)";
	dom.style.fontSize = "12px";
	dom.style.lineHeight = "1.5";
	dom.style.whiteSpace = "pre-wrap";
	dom.style.wordBreak = "break-word";

	contents.forEach((content, index) => {
		const section = document.createElement("div");
		if (index > 0) {
			section.style.marginTop = "8px";
			section.style.paddingTop = "8px";
			section.style.borderTop = "1px solid hsl(var(--border))";
		}

		if (content.kind === "markdown") {
			section.style.fontFamily =
				"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
		}

		section.textContent = content.value;
		dom.appendChild(section);
	});

	return dom;
}

export function createSymbolInteractions({
	resolveHover,
	onGoToDefinition,
	onCursorChange,
}: CreateSymbolInteractionsOptions): Extension[] {
	const extensions: Extension[] = [];

	if (resolveHover) {
		extensions.push(
			hoverTooltip(
				async (view, pos): Promise<Tooltip | null> => {
					const hover = await resolveHover(
						docOffsetToPosition(view.state.doc, pos),
					);
					if (!hover || hover.contents.length === 0) {
						return null;
					}

					const { from, to } = rangeToOffsets(view.state.doc, hover.range, pos);
					return {
						pos: from,
						end: to,
						above: true,
						arrow: true,
						create() {
							return {
								dom: createTooltipDom(hover.contents),
							};
						},
					};
				},
				{ hoverTime: 250 },
			),
		);
	}

	if (onGoToDefinition) {
		extensions.push(
			keymap.of([
				{
					key: "F12",
					run(view) {
						void onGoToDefinition(
							docOffsetToPosition(
								view.state.doc,
								view.state.selection.main.head,
							),
						);
						return true;
					},
				},
			]),
		);

		extensions.push(
			EditorView.domEventHandlers({
				mousedown(event, view) {
					if (
						event.button !== 0 ||
						(!event.metaKey && !event.ctrlKey) ||
						event.altKey ||
						event.shiftKey
					) {
						return false;
					}

					const offset = view.posAtCoords({
						x: event.clientX,
						y: event.clientY,
					});
					if (offset === null) {
						return false;
					}

					event.preventDefault();
					void onGoToDefinition(docOffsetToPosition(view.state.doc, offset));
					return true;
				},
			}),
		);
	}

	if (onCursorChange) {
		const notifyCursor = (view: EditorView) => {
			onCursorChange(
				view.hasFocus
					? docOffsetToPosition(view.state.doc, view.state.selection.main.head)
					: null,
			);
		};

		extensions.push(
			ViewPlugin.fromClass(
				class {
					constructor(view: EditorView) {
						notifyCursor(view);
					}

					update(update: ViewUpdate) {
						if (
							update.selectionSet ||
							update.focusChanged ||
							update.docChanged
						) {
							notifyCursor(update.view);
						}
					}

					destroy() {
						onCursorChange(null);
					}
				},
			),
		);
	}

	return extensions;
}
