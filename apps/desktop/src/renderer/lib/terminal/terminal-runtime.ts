import { FitAddon } from "@xterm/addon-fit";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Terminal as XTerm } from "@xterm/xterm";

const SERIALIZE_SCROLLBACK = 1000;
const STORAGE_KEY_PREFIX = "terminal-buffer:";
const DIMS_KEY_PREFIX = "terminal-dims:";
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;

export interface TerminalRuntime {
	paneId: string;
	terminal: XTerm;
	fitAddon: FitAddon;
	serializeAddon: SerializeAddon;
	/** Reparented between containers across attach/detach cycles — not recreated. */
	wrapper: HTMLDivElement;
	container: HTMLDivElement | null;
	resizeObserver: ResizeObserver | null;
	/** Fallback grid size used when the host is not visible. */
	lastCols: number;
	lastRows: number;
}

function createTerminal(
	cols: number,
	rows: number,
): {
	terminal: XTerm;
	fitAddon: FitAddon;
	serializeAddon: SerializeAddon;
} {
	const fitAddon = new FitAddon();
	const serializeAddon = new SerializeAddon();
	const terminal = new XTerm({
		cols,
		rows,
		cursorBlink: true,
		fontFamily:
			'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
		fontSize: 12,
		theme: {
			background: "#14100f",
			foreground: "#f5efe9",
		},
	});
	terminal.loadAddon(fitAddon);
	terminal.loadAddon(serializeAddon);
	return { terminal, fitAddon, serializeAddon };
}

function persistBuffer(paneId: string, serializeAddon: SerializeAddon) {
	try {
		const data = serializeAddon.serialize({ scrollback: SERIALIZE_SCROLLBACK });
		localStorage.setItem(`${STORAGE_KEY_PREFIX}${paneId}`, data);
	} catch {}
}

function restoreBuffer(paneId: string, terminal: XTerm) {
	try {
		const data = localStorage.getItem(`${STORAGE_KEY_PREFIX}${paneId}`);
		if (data) terminal.write(data);
	} catch {}
}

function clearPersistedBuffer(paneId: string) {
	try {
		localStorage.removeItem(`${STORAGE_KEY_PREFIX}${paneId}`);
	} catch {}
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

export function createRuntime(paneId: string): TerminalRuntime {
	const savedDims = loadSavedDimensions(paneId);
	const cols = savedDims?.cols ?? DEFAULT_COLS;
	const rows = savedDims?.rows ?? DEFAULT_ROWS;

	const { terminal, fitAddon, serializeAddon } = createTerminal(cols, rows);

	const wrapper = document.createElement("div");
	wrapper.style.width = "100%";
	wrapper.style.height = "100%";
	terminal.open(wrapper);
	restoreBuffer(paneId, terminal);

	return {
		paneId,
		terminal,
		fitAddon,
		serializeAddon,
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

	// Force a full repaint — the renderer may have skipped paint frames while
	// the wrapper was detached from the DOM and receiving background data.
	runtime.terminal.refresh(0, runtime.terminal.rows - 1);

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
	persistBuffer(runtime.paneId, runtime.serializeAddon);
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
	clearPersistedBuffer(runtime.paneId);
	clearPersistedDimensions(runtime.paneId);
}
