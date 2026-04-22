import { FitAddon } from "@xterm/addon-fit";
import type { ProgressAddon } from "@xterm/addon-progress";
import type { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Terminal as XTerm } from "@xterm/xterm";
import { resolveHotkeyFromEvent } from "renderer/hotkeys";
import { DEFAULT_TERMINAL_SCROLLBACK } from "shared/constants";
import type { TerminalAppearance } from "./appearance";
import { TerminalResizeDebouncer } from "./resize-debouncer";
import { loadAddons } from "./terminal-addons";

const SERIALIZE_SCROLLBACK = 1000;
const STORAGE_KEY_PREFIX = "terminal-buffer:";
const DIMS_KEY_PREFIX = "terminal-dims:";
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;

// xterm's _keyDown calls stopPropagation after processing, which kills the
// bubble to react-hotkeys-hook. Returning false from the custom handler makes
// xterm bail before that, so app hotkeys reach document. (VSCode pattern:
// terminalInstance.ts:1116-1175)
function isAppHotkey(event: KeyboardEvent): boolean {
	return resolveHotkeyFromEvent(event) !== null;
}

export interface TerminalRuntime {
	terminalId: string;
	terminal: XTerm;
	fitAddon: FitAddon;
	serializeAddon: SerializeAddon;
	searchAddon: SearchAddon | null;
	progressAddon: ProgressAddon | null;
	wrapper: HTMLDivElement;
	container: HTMLDivElement | null;
	resizeObserver: ResizeObserver | null;
	/** Debounces the expensive horizontal reflow during rapid container resizes. */
	resizeDebouncer: TerminalResizeDebouncer;
	lastCols: number;
	lastRows: number;
	_disposeAddons: (() => void) | null;
}

function createTerminal(
	cols: number,
	rows: number,
	appearance: TerminalAppearance,
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
		fontFamily: appearance.fontFamily,
		fontSize: appearance.fontSize,
		theme: appearance.theme,
		allowProposedApi: true,
		scrollback: DEFAULT_TERMINAL_SCROLLBACK,
		macOptionIsMeta: false,
		cursorStyle: "block",
		cursorInactiveStyle: "outline",
		vtExtensions: { kittyKeyboard: true },
		scrollbar: { showScrollbar: false },
	});
	terminal.loadAddon(fitAddon);
	terminal.loadAddon(serializeAddon);
	return { terminal, fitAddon, serializeAddon };
}

function persistBuffer(terminalId: string, serializeAddon: SerializeAddon) {
	try {
		const data = serializeAddon.serialize({ scrollback: SERIALIZE_SCROLLBACK });
		localStorage.setItem(`${STORAGE_KEY_PREFIX}${terminalId}`, data);
	} catch {}
}

function restoreBuffer(terminalId: string, terminal: XTerm) {
	try {
		const data = localStorage.getItem(`${STORAGE_KEY_PREFIX}${terminalId}`);
		if (data) terminal.write(data);
	} catch {}
}

function clearPersistedBuffer(terminalId: string) {
	try {
		localStorage.removeItem(`${STORAGE_KEY_PREFIX}${terminalId}`);
	} catch {}
}

function persistDimensions(terminalId: string, cols: number, rows: number) {
	try {
		localStorage.setItem(
			`${DIMS_KEY_PREFIX}${terminalId}`,
			JSON.stringify({ cols, rows }),
		);
	} catch {}
}

function loadSavedDimensions(
	terminalId: string,
): { cols: number; rows: number } | null {
	try {
		const raw = localStorage.getItem(`${DIMS_KEY_PREFIX}${terminalId}`);
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

function clearPersistedDimensions(terminalId: string) {
	try {
		localStorage.removeItem(`${DIMS_KEY_PREFIX}${terminalId}`);
	} catch {}
}

function hostIsVisible(container: HTMLDivElement | null): boolean {
	if (!container) return false;
	return container.clientWidth > 0 && container.clientHeight > 0;
}

function measureAndResize(runtime: TerminalRuntime, immediate: boolean) {
	if (!hostIsVisible(runtime.container)) return;
	// Split what `fitAddon.fit()` would do into propose → apply so the debouncer
	// can coalesce the apply step (expensive reflow on cols change).
	const dims = runtime.fitAddon.proposeDimensions();
	if (!dims) return;
	// Skip no-change ticks — ResizeObserver fires on subpixel layout shifts
	// that often don't change the cell grid.
	if (
		dims.cols === runtime.terminal.cols &&
		dims.rows === runtime.terminal.rows
	) {
		return;
	}
	runtime.resizeDebouncer.resize(dims.cols, dims.rows, immediate);
}

export function createRuntime(
	terminalId: string,
	appearance: TerminalAppearance,
): TerminalRuntime {
	const savedDims = loadSavedDimensions(terminalId);
	const cols = savedDims?.cols ?? DEFAULT_COLS;
	const rows = savedDims?.rows ?? DEFAULT_ROWS;

	const { terminal, fitAddon, serializeAddon } = createTerminal(
		cols,
		rows,
		appearance,
	);

	const wrapper = document.createElement("div");
	wrapper.style.width = "100%";
	wrapper.style.height = "100%";
	terminal.open(wrapper);

	terminal.attachCustomKeyEventHandler((event) => !isAppHotkey(event));

	// Activate Unicode 11 widths (inside loadAddons) before restoring the buffer,
	// else CJK/emoji/ZWJ widths get baked wrong into the replay. (#3572)
	const addonsResult = loadAddons(terminal);
	restoreBuffer(terminalId, terminal);

	const runtime: TerminalRuntime = {
		terminalId,
		terminal,
		fitAddon,
		serializeAddon,
		searchAddon: addonsResult.searchAddon,
		progressAddon: addonsResult.progressAddon,
		wrapper,
		container: null,
		resizeObserver: null,
		// Assigned immediately below — declared non-null here since the debouncer
		// closes over `runtime` and would otherwise need a placeholder.
		resizeDebouncer: null as unknown as TerminalResizeDebouncer,
		lastCols: cols,
		lastRows: rows,
		_disposeAddons: addonsResult.dispose,
	};

	runtime.resizeDebouncer = new TerminalResizeDebouncer({
		isVisible: () => hostIsVisible(runtime.container),
		getBufferLength: () => terminal.buffer.normal.length,
		resizeBoth: (c, r) => {
			terminal.resize(c, r);
			runtime.lastCols = c;
			runtime.lastRows = r;
		},
		resizeX: (c) => {
			terminal.resize(c, terminal.rows);
			runtime.lastCols = c;
		},
		resizeY: (r) => {
			terminal.resize(terminal.cols, r);
			runtime.lastRows = r;
		},
	});

	return runtime;
}

export function attachToContainer(
	runtime: TerminalRuntime,
	container: HTMLDivElement,
	onResize?: () => void,
) {
	runtime.container = container;
	container.appendChild(runtime.wrapper);
	// Initial attach: apply dimensions now so the first frame isn't stale.
	measureAndResize(runtime, true);

	// Renderer may have skipped frames while the wrapper was detached.
	runtime.terminal.refresh(0, runtime.terminal.rows - 1);

	runtime.resizeObserver?.disconnect();
	const observer = new ResizeObserver(() => {
		// Subsequent resizes go through the debouncer (splitter drags,
		// window resizes, sidebar toggles fire this many times per frame).
		measureAndResize(runtime, false);
		onResize?.();
	});
	observer.observe(container);
	runtime.resizeObserver = observer;

	runtime.terminal.focus();
}

export function detachFromContainer(runtime: TerminalRuntime) {
	// Flush any pending debounced resize so `lastCols`/`lastRows` reflect the
	// latest intended dimensions before we persist them.
	runtime.resizeDebouncer.flush();
	persistBuffer(runtime.terminalId, runtime.serializeAddon);
	persistDimensions(runtime.terminalId, runtime.lastCols, runtime.lastRows);
	runtime.resizeObserver?.disconnect();
	runtime.resizeObserver = null;
	runtime.wrapper.remove();
	runtime.container = null;
}

export function updateRuntimeAppearance(
	runtime: TerminalRuntime,
	appearance: TerminalAppearance,
) {
	const { terminal } = runtime;
	terminal.options.theme = appearance.theme;

	const fontChanged =
		terminal.options.fontFamily !== appearance.fontFamily ||
		terminal.options.fontSize !== appearance.fontSize;

	if (fontChanged) {
		terminal.options.fontFamily = appearance.fontFamily;
		terminal.options.fontSize = appearance.fontSize;
		// Font change is an explicit user action → apply immediately.
		measureAndResize(runtime, true);
	}
}

export function disposeRuntime(runtime: TerminalRuntime) {
	runtime._disposeAddons?.();
	runtime._disposeAddons = null;
	runtime.resizeObserver?.disconnect();
	runtime.resizeObserver = null;
	runtime.resizeDebouncer.dispose();
	runtime.wrapper.remove();
	runtime.terminal.dispose();
	clearPersistedBuffer(runtime.terminalId);
	clearPersistedDimensions(runtime.terminalId);
}
