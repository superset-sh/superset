import type { Terminal as XTerm } from "@xterm/xterm";

export type TerminalHandle = XTerm;

export type GhosttyRuntimeRenderer = {
	remeasureFont?: () => void;
	resize?: (cols: number, rows: number) => void;
	setTheme?: (theme: NonNullable<XTerm["options"]["theme"]>) => void;
	setFontFamily?: (family: string) => void;
	setFontSize?: (size: number) => void;
	getCanvas?: () => HTMLCanvasElement;
	getMetrics?: () => { width: number; height: number };
};

type GhosttyRuntime = XTerm & {
	blur?: () => void;
	renderer?: GhosttyRuntimeRenderer;
};

export function getRuntimeRenderer(
	terminal: TerminalHandle,
): GhosttyRuntimeRenderer | undefined {
	return (terminal as GhosttyRuntime).renderer;
}

export function getTerminalTextarea(
	terminal: TerminalHandle,
): HTMLTextAreaElement | null {
	const textarea = terminal.textarea;
	if (
		textarea &&
		typeof textarea.focus === "function" &&
		typeof textarea.blur === "function"
	) {
		return textarea as HTMLTextAreaElement;
	}
	return null;
}

export function focusTerminalInput(terminal: TerminalHandle): void {
	terminal.focus();
	getTerminalTextarea(terminal)?.focus();
}

export function blurTerminalInput(terminal: TerminalHandle): void {
	(terminal as GhosttyRuntime).blur?.();
	getTerminalTextarea(terminal)?.blur();
}

function getTerminalCanvas(terminal: TerminalHandle): HTMLCanvasElement | null {
	return (
		terminal.element?.querySelector("canvas") ??
		getRuntimeRenderer(terminal)?.getCanvas?.() ??
		null
	);
}

function getTerminalCellMetrics(
	terminal: TerminalHandle,
): { width: number; height: number } | null {
	return getRuntimeRenderer(terminal)?.getMetrics?.() ?? null;
}

export function getTerminalCoordsFromEvent(
	terminal: TerminalHandle,
	event: MouseEvent,
): { col: number; row: number } | null {
	const canvas = getTerminalCanvas(terminal);
	if (!canvas || typeof canvas.getBoundingClientRect !== "function")
		return null;

	const rect = canvas.getBoundingClientRect();
	const x = event.clientX - rect.left;
	const y = event.clientY - rect.top;

	const metrics = getTerminalCellMetrics(terminal);
	if (!metrics) return null;

	const cellWidth = metrics.width;
	const cellHeight = metrics.height;
	if (cellWidth <= 0 || cellHeight <= 0) return null;

	const col = Math.max(
		0,
		Math.min(terminal.cols - 1, Math.floor(x / cellWidth)),
	);
	const row = Math.max(
		0,
		Math.min(terminal.rows - 1, Math.floor(y / cellHeight)),
	);

	return { col, row };
}
