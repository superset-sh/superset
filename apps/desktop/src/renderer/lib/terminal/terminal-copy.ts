import type { IBufferLine, Terminal as XTerm } from "@xterm/xterm";
import { writeTerminalClipboard } from "./terminal-clipboard";

type SelectionTerminal = Pick<
	XTerm,
	"getSelection" | "getSelectionPosition" | "buffer"
>;

function isWideWrapSpacer(
	line: IBufferLine | undefined,
	nextLine: IBufferLine | undefined,
	x: number,
): boolean {
	// xterm represents Ghostty's spacer_head as an empty cell before a wide glyph.
	return !!(
		line &&
		x === line.length - 1 &&
		!line.getCell(x)?.getChars() &&
		nextLine?.isWrapped &&
		nextLine.getCell(0)?.getWidth() === 2
	);
}

export function trimTerminalSelection(selection: string): string {
	return selection.replace(/ +(?=\r?\n|$)/g, "").replace(/(?:\r?\n)+$/, "");
}

export function getTerminalSelectionForCopy(
	terminal: SelectionTerminal,
): string {
	const selection = terminal.getSelection();
	const position = terminal.getSelectionPosition?.();
	if (!position) return trimTerminalSelection(selection);

	// xterm only exposes rectangular selection mode through this private field.
	const internal = terminal as SelectionTerminal & {
		_core?: { _selectionService?: { _activeSelectionMode?: number } };
	};
	const mode = internal._core?._selectionService?._activeSelectionMode;
	if (mode === undefined || mode < 0 || mode > 3) {
		return trimTerminalSelection(selection);
	}
	const rectangle = mode === 3;
	const { start } = position;
	let { end } = position;
	const buffer = terminal.buffer.active;
	if (
		!rectangle &&
		isWideWrapSpacer(
			buffer.getLine(end.y),
			buffer.getLine(end.y + 1),
			end.x - 1,
		)
	) {
		end = { x: 1, y: end.y + 1 };
	}
	let result = "";
	let blankRows = 0;
	let blankCells = 0;
	for (let y = start.y; y <= end.y; y++) {
		const line = buffer.getLine(y);
		if (!line?.getCell) return trimTerminalSelection(selection);
		let startX = rectangle
			? Math.min(start.x, end.x)
			: y === start.y
				? start.x
				: 0;
		const endX = rectangle
			? Math.max(start.x, end.x)
			: y === end.y
				? end.x
				: line.length;
		if (startX >= endX) continue;
		if (startX > 0 && line.getCell(startX)?.getWidth() === 0) startX--;
		const cells: string[] = [];
		for (let x = startX; x < endX; x++) {
			const cell = line.getCell(x);
			if (!cell || cell.getWidth() === 0) continue;
			if (isWideWrapSpacer(line, buffer.getLine(y + 1), x)) continue;
			cells.push(cell.getChars());
		}
		if (cells.length === 0) continue;
		if (!cells.some((cell) => cell !== "")) {
			blankRows++;
			continue;
		}
		result += "\n".repeat(blankRows);
		blankRows = !buffer.getLine(y + 1)?.isWrapped ? 1 : 0;
		if (!line.isWrapped) blankCells = 0;
		for (const cell of cells) {
			if (cell === "" || cell === " ") {
				blankCells++;
			} else {
				result += " ".repeat(blankCells) + cell;
				blankCells = 0;
			}
		}
	}
	return result;
}

export function installTerminalCopyHandler(
	terminal: XTerm,
	writeText: (text: string) => Promise<void> = writeTerminalClipboard,
): () => void {
	const element = terminal.element;
	if (!element) return () => {};

	const handleCopy = (event: ClipboardEvent) => {
		const text = getTerminalSelectionForCopy(terminal);
		if (!text && !(terminal.hasSelection?.() ?? !!terminal.getSelection()))
			return;
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
