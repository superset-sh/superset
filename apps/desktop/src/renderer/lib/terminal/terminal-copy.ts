import type { Terminal as XTerm } from "@xterm/xterm";
import { writeTerminalClipboard } from "./terminal-clipboard";

type SelectionTerminal = Pick<
	XTerm,
	"getSelection" | "getSelectionPosition" | "buffer"
>;

const XTERM_LINEAR_SELECTION_MODES = {
	normal: 0,
	word: 1,
	line: 2,
} as const;

function hasLinearSelection(terminal: SelectionTerminal): boolean {
	// xterm exposes bounds publicly, but the selection mode is private in our
	// pinned version. Preserve raw text if that internal contract changes.
	const internal = terminal as SelectionTerminal & {
		_core?: { _selectionService?: { _activeSelectionMode?: number } };
	};
	const mode = internal._core?._selectionService?._activeSelectionMode;
	return (
		mode === XTERM_LINEAR_SELECTION_MODES.normal ||
		mode === XTERM_LINEAR_SELECTION_MODES.word ||
		mode === XTERM_LINEAR_SELECTION_MODES.line
	);
}

export function trimTerminalSelection(
	selection: string,
	{ preserveLastLine = false }: { preserveLastLine?: boolean } = {},
): string {
	if (!/[^ \t\r\n]/.test(selection)) return selection;
	const parts = selection.split(/(\r\n|\n)/);
	return parts
		.map((part, index) =>
			index % 2 === 0 && (!preserveLastLine || index < parts.length - 1)
				? part.replace(/ +$/, "")
				: part,
		)
		.join("");
}

export function getTerminalSelectionForCopy(
	terminal: SelectionTerminal,
): string {
	const selection = terminal.getSelection();
	if (!selection.includes("\n")) return selection;
	if (!hasLinearSelection(terminal)) return selection;

	const position = terminal.getSelectionPosition();
	if (!position || position.start.y === position.end.y) return selection;
	const buffer = terminal.buffer.active;
	const endLine = buffer.getLine(position.end.y);
	if (!endLine) return selection;
	const remainder = endLine.translateToString(false, position.end.x);
	const continues = buffer.getLine(position.end.y + 1)?.isWrapped ?? false;
	return trimTerminalSelection(selection, {
		preserveLastLine: continues || /[^ ]/.test(remainder),
	});
}

export function installTerminalCopyHandler(
	terminal: XTerm,
	writeText: (text: string) => Promise<void> = writeTerminalClipboard,
): () => void {
	const element = terminal.element;
	if (!element) return () => {};

	const handleCopy = (event: ClipboardEvent) => {
		const text = getTerminalSelectionForCopy(terminal);
		if (!text) return;
		event.preventDefault();
		if (event.clipboardData) {
			try {
				event.clipboardData.setData("text/plain", text);
				return;
			} catch {}
		}
		void writeText(text).catch((error: unknown) => {
			console.error("[terminal] Failed to copy selection", error);
		});
	};

	element.addEventListener("copy", handleCopy);
	return () => element.removeEventListener("copy", handleCopy);
}
