import { FitAddon, Terminal as GhosttyTerminal } from "ghostty-web";
import { getGhosttyInstance } from "./ghostty-vt";

const DIMS_KEY_PREFIX = "terminal-dims:";
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;

export interface TerminalRuntime {
	paneId: string;
	terminal: GhosttyTerminal;
	fitAddon: FitAddon;
	/** Reparented between containers across attach/detach cycles — not recreated. */
	wrapper: HTMLDivElement;
	container: HTMLDivElement | null;
	resizeObserver: ResizeObserver | null;
	/** Fallback grid size used when the host is not visible. */
	lastCols: number;
	lastRows: number;
}

async function createTerminal(
	cols: number,
	rows: number,
): Promise<{
	terminal: GhosttyTerminal;
	fitAddon: FitAddon;
}> {
	const ghostty = await getGhosttyInstance();
	const fitAddon = new FitAddon();
	const terminal = new GhosttyTerminal({
		ghostty,
		cols,
		rows,
		cursorBlink: true,
		fontFamily:
			'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
		fontSize: 12,
		scrollback: 10_000,
		theme: {
			background: "#14100f",
			foreground: "#f5efe9",
		},
	});
	terminal.loadAddon(fitAddon);
	return { terminal, fitAddon };
}

function persistDimensions(paneId: string, cols: number, rows: number) {
	try {
		localStorage.setItem(
			`${DIMS_KEY_PREFIX}${paneId}`,
			JSON.stringify({ cols, rows }),
		);
	} catch {}
}

function loadSavedDimensions(
	paneId: string,
): { cols: number; rows: number } | null {
	try {
		const raw = localStorage.getItem(`${DIMS_KEY_PREFIX}${paneId}`);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (typeof parsed.cols === "number" && typeof parsed.rows === "number") {
			return parsed;
		}
		return null;
	} catch {
		return null;
	}
}

function clearPersistedDimensions(paneId: string) {
	try {
		localStorage.removeItem(`${DIMS_KEY_PREFIX}${paneId}`);
	} catch {}
}

function hostIsVisible(container: HTMLDivElement | null): boolean {
	if (!container) return false;
	return container.clientWidth > 0 && container.clientHeight > 0;
}

function measureAndResize(runtime: TerminalRuntime) {
	if (!hostIsVisible(runtime.container)) return;
	runtime.fitAddon.fit();
	runtime.lastCols = runtime.terminal.cols;
	runtime.lastRows = runtime.terminal.rows;
}

export async function createRuntime(paneId: string): Promise<TerminalRuntime> {
	const savedDims = loadSavedDimensions(paneId);
	const cols = savedDims?.cols ?? DEFAULT_COLS;
	const rows = savedDims?.rows ?? DEFAULT_ROWS;

	const { terminal, fitAddon } = await createTerminal(cols, rows);

	const wrapper = document.createElement("div");
	wrapper.style.width = "100%";
	wrapper.style.height = "100%";
	wrapper.style.overflow = "hidden";
	terminal.open(wrapper);

	return {
		paneId,
		terminal,
		fitAddon,
		wrapper,
		container: null,
		resizeObserver: null,
		lastCols: cols,
		lastRows: rows,
	};
}

export function attachToContainer(
	runtime: TerminalRuntime,
	container: HTMLDivElement,
	onResize?: () => void,
) {
	runtime.container = container;
	container.appendChild(runtime.wrapper);
	measureAndResize(runtime);

	runtime.resizeObserver?.disconnect();
	const observer = new ResizeObserver(() => {
		measureAndResize(runtime);
		onResize?.();
	});
	observer.observe(container);
	runtime.resizeObserver = observer;

	runtime.terminal.focus();
}

export function detachFromContainer(runtime: TerminalRuntime) {
	persistDimensions(runtime.paneId, runtime.lastCols, runtime.lastRows);
	runtime.resizeObserver?.disconnect();
	runtime.resizeObserver = null;
	runtime.wrapper.remove();
	runtime.container = null;
}

export function disposeRuntime(runtime: TerminalRuntime) {
	runtime.resizeObserver?.disconnect();
	runtime.resizeObserver = null;
	runtime.wrapper.remove();
	runtime.terminal.dispose();
	clearPersistedDimensions(runtime.paneId);
}
