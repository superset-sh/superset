import { FitAddon } from "@xterm/addon-fit";
import type { ProgressAddon } from "@xterm/addon-progress";
import type { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Terminal as XTerm } from "@xterm/xterm";
import { DEFAULT_TERMINAL_SCROLLBACK } from "shared/constants";
import type { TerminalAppearance } from "./appearance";
import { loadAddons } from "./terminal-addons";
import { setupClickToMoveCursor } from "./terminal-click-to-move";
import { installTerminalKeyEventHandler } from "./terminal-key-event-handler";
import { getTerminalParkingContainer } from "./terminal-parking";

const SERIALIZE_SCROLLBACK = 1000;
const STORAGE_KEY_PREFIX = "terminal-buffer:";
const DIMS_KEY_PREFIX = "terminal-dims:";
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;
const RESIZE_DEBOUNCE_MS = 75;

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
	_disposeResizeObserver: (() => void) | null;
	lastCols: number;
	lastRows: number;
	_disposeAddons: (() => void) | null;
	_disposeMouseHandlers: (() => void) | null;
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

function measureAndResize(runtime: TerminalRuntime): boolean {
	if (!hostIsVisible(runtime.container)) return false;
	const { terminal } = runtime;
	const buffer = terminal.buffer.active;
	const wasPinnedToBottom = buffer.viewportY >= buffer.baseY;
	const savedViewportY = buffer.viewportY;
	const prevCols = terminal.cols;
	const prevRows = terminal.rows;

	runtime.fitAddon.fit();
	runtime.lastCols = terminal.cols;
	runtime.lastRows = terminal.rows;

	if (wasPinnedToBottom) {
		terminal.scrollToBottom();
	} else {
		const targetY = Math.min(savedViewportY, terminal.buffer.active.baseY);
		if (terminal.buffer.active.viewportY !== targetY) {
			terminal.scrollToLine(targetY);
		}
	}

	terminal.refresh(0, Math.max(0, terminal.rows - 1));

	return terminal.cols !== prevCols || terminal.rows !== prevRows;
}

function createResizeScheduler(
	runtime: TerminalRuntime,
	onResize?: () => void,
): {
	observe: ResizeObserverCallback;
	dispose: () => void;
} {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	const dispose = () => {
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
	};

	const run = () => {
		timeoutId = null;
		const changed = measureAndResize(runtime);
		if (changed) onResize?.();
	};

	const observe: ResizeObserverCallback = (entries) => {
		if (
			entries.some(
				(entry) =>
					entry.contentRect.width <= 0 || entry.contentRect.height <= 0,
			)
		) {
			dispose();
			return;
		}
		dispose();
		timeoutId = setTimeout(run, RESIZE_DEBOUNCE_MS);
	};

	return { observe, dispose };
}

export interface CreateRuntimeOptions {
	initialBuffer?: string;
	/**
	 * Send synthesized user input (e.g. arrow-key sequences from
	 * click-to-move-cursor) to the PTY. Routed through the same path as
	 * keystrokes so the backend treats it uniformly.
	 */
	onUserInput?: (data: string) => void;
}

export function createRuntime(
	terminalId: string,
	appearance: TerminalAppearance,
	options: CreateRuntimeOptions = {},
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

	installTerminalKeyEventHandler(terminal);

	// Activate Unicode 11 widths (inside loadAddons) before restoring the buffer,
	// else CJK/emoji/ZWJ widths get baked wrong into the replay. (#3572)
	const addonsResult = loadAddons(terminal);
	if (options.initialBuffer !== undefined) {
		terminal.write(options.initialBuffer);
	} else {
		restoreBuffer(terminalId, terminal);
	}

	const disposeMouseHandlers = installMouseHandlers(terminal, {
		onUserInput: options.onUserInput,
	});

	return {
		terminalId,
		terminal,
		fitAddon,
		serializeAddon,
		searchAddon: addonsResult.searchAddon,
		progressAddon: addonsResult.progressAddon,
		wrapper,
		container: null,
		resizeObserver: null,
		_disposeResizeObserver: null,
		lastCols: cols,
		lastRows: rows,
		_disposeAddons: addonsResult.dispose,
		_disposeMouseHandlers: disposeMouseHandlers,
	};
}

/**
 * Install mouse-related handlers on the xterm element:
 *
 *   1. Click-to-move-cursor: left-click on the prompt line moves the shell
 *      cursor by emitting arrow-key sequences (parity with v1, VS Code, iTerm).
 *   2. Suppress xterm's built-in non-left-button "primary selection" paste —
 *      otherwise right-click silently dumps the last clipboard contents into
 *      the PTY. We swallow the right-button mousedown in the capture phase
 *      so xterm's SelectionService never sees it; the textarea still gets
 *      focus from the synthesized focus event, which is what users expect.
 *   3. Suppress the OS context menu, matching v1 behavior.
 */
function installMouseHandlers(
	terminal: XTerm,
	options: { onUserInput?: (data: string) => void },
): () => void {
	const cleanups: Array<() => void> = [];

	if (options.onUserInput) {
		const userInput = options.onUserInput;
		const cleanupClickToMove = setupClickToMoveCursor(terminal, {
			onWrite: (data) => userInput(data),
		});
		cleanups.push(cleanupClickToMove);
	}

	const element = terminal.element;
	if (element) {
		const handleMouseDown = (event: MouseEvent) => {
			// Block xterm's primary-selection paste on right-click. Capture phase
			// runs before xterm's own mousedown handler.
			if (event.button === 2) {
				event.preventDefault();
				event.stopImmediatePropagation();
				// Still focus the terminal so subsequent keystrokes go to the PTY —
				// this matches the user's mental model ("clicking the terminal
				// focuses it") without the unwanted paste side effect.
				terminal.focus();
				return;
			}

			// Defensive: ensure left-click reliably focuses the terminal across
			// pane switches even if xterm's own focus handling regresses.
			if (
				event.button === 0 &&
				!event.metaKey &&
				!event.ctrlKey &&
				!event.altKey &&
				!event.shiftKey
			) {
				terminal.focus();
			}
		};
		const handleContextMenu = (event: MouseEvent) => {
			event.preventDefault();
		};

		element.addEventListener("mousedown", handleMouseDown, { capture: true });
		element.addEventListener("contextmenu", handleContextMenu);
		cleanups.push(() => {
			element.removeEventListener("mousedown", handleMouseDown, {
				capture: true,
			});
			element.removeEventListener("contextmenu", handleContextMenu);
		});
	}

	return () => {
		for (const cleanup of cleanups) cleanup();
	};
}

export function attachToContainer(
	runtime: TerminalRuntime,
	container: HTMLDivElement,
	onResize?: () => void,
) {
	// If we're already attached to this exact container, do nothing. Prevents
	// redundant refresh/focus/fit from transient remounts during provider key
	// churn — VSCode setVisible() is idempotent for the same host element.
	const sameContainer =
		runtime.container === container &&
		runtime.wrapper.parentElement === container;
	if (sameContainer && runtime.resizeObserver) {
		return;
	}

	runtime.container = container;
	container.appendChild(runtime.wrapper);
	if (measureAndResize(runtime)) onResize?.();

	runtime._disposeResizeObserver?.();
	runtime._disposeResizeObserver = null;
	runtime.resizeObserver?.disconnect();
	const scheduler = createResizeScheduler(runtime, onResize);
	const observer = new ResizeObserver(scheduler.observe);
	observer.observe(container);
	runtime.resizeObserver = observer;
	runtime._disposeResizeObserver = scheduler.dispose;

	runtime.terminal.focus();
}

export function detachFromContainer(runtime: TerminalRuntime) {
	persistBuffer(runtime.terminalId, runtime.serializeAddon);
	persistDimensions(runtime.terminalId, runtime.lastCols, runtime.lastRows);
	runtime._disposeResizeObserver?.();
	runtime._disposeResizeObserver = null;
	runtime.resizeObserver?.disconnect();
	runtime.resizeObserver = null;
	// Park instead of .remove() so xterm survives the React unmount —
	// see getTerminalParkingContainer.
	getTerminalParkingContainer().appendChild(runtime.wrapper);
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
		if (hostIsVisible(runtime.container)) {
			measureAndResize(runtime);
		}
	}
}

export function disposeRuntime(
	runtime: TerminalRuntime,
	options: { clearPersistedState?: boolean } = {},
) {
	const clearPersistedState = options.clearPersistedState ?? true;
	if (!clearPersistedState) {
		persistBuffer(runtime.terminalId, runtime.serializeAddon);
		persistDimensions(runtime.terminalId, runtime.lastCols, runtime.lastRows);
	}
	runtime._disposeAddons?.();
	runtime._disposeAddons = null;
	runtime._disposeMouseHandlers?.();
	runtime._disposeMouseHandlers = null;
	runtime._disposeResizeObserver?.();
	runtime._disposeResizeObserver = null;
	runtime.resizeObserver?.disconnect();
	runtime.resizeObserver = null;
	runtime.wrapper.remove();
	runtime.terminal.dispose();
	if (clearPersistedState) {
		clearPersistedBuffer(runtime.terminalId);
		clearPersistedDimensions(runtime.terminalId);
	}
}
