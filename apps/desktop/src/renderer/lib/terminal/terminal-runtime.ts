import { FitAddon } from "@xterm/addon-fit";
import type { ProgressAddon } from "@xterm/addon-progress";
import type { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Terminal as XTerm } from "@xterm/xterm";
import { resolveHotkeyFromEvent } from "renderer/hotkeys";
import {
	shouldBubbleClipboardShortcut,
	shouldSelectAllShortcut,
} from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/clipboardShortcuts";
import { DEFAULT_TERMINAL_SCROLLBACK } from "shared/constants";
import type { TerminalAppearance } from "./appearance";
import { translateLineEditChord } from "./line-edit-translations";
import { loadAddons } from "./terminal-addons";

const SERIALIZE_SCROLLBACK = 1000;
const STORAGE_KEY_PREFIX = "terminal-buffer:";
const DIMS_KEY_PREFIX = "terminal-dims:";
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;
const RESIZE_DEBOUNCE_MS = 75;

// xterm's _keyDown calls stopPropagation after processing, so any chord we
// want the host (react-hotkeys-hook, Electron menu accelerators) or the shell
// (Ctrl+A/E/U escape sequences for line edit) to see must short-circuit xterm
// before it runs. (VSCode pattern: terminalInstance.ts:1116-1175.)
//
// Kitty keyboard protocol is enabled, which means every Mac Cmd chord xterm
// sees gets CSI-u encoded and leaks into TUIs as a literal char. Ghostty
// sidesteps this by suppressing all super/Cmd chords on macOS before the
// encoder runs (ghostty/src/input/key_encode.zig:534-545). We do the same via
// shouldBubbleClipboardShortcut's Mac branch.
function createKeyEventHandler(terminal: XTerm) {
	const platform =
		typeof navigator !== "undefined" ? navigator.platform.toLowerCase() : "";
	const isMac = platform.includes("mac");
	const isWindows = platform.includes("win");

	return (event: KeyboardEvent): boolean => {
		if (resolveHotkeyFromEvent(event) !== null) return false;

		const translation = translateLineEditChord(event, { isMac, isWindows });
		if (translation !== null) {
			if (event.type === "keydown") {
				event.preventDefault();
				terminal.input(translation, true);
			}
			return false;
		}

		if (shouldSelectAllShortcut(event, isMac)) {
			if (event.type === "keydown") {
				event.preventDefault();
				terminal.selectAll();
			}
			return false;
		}

		if (
			shouldBubbleClipboardShortcut(event, {
				isMac,
				isWindows,
				hasSelection: terminal.hasSelection(),
			})
		) {
			// Do NOT preventDefault — the browser's keydown → paste-command pipeline
			// is what fires the `paste` event on xterm's textarea. VS Code and Tabby
			// preventDefault here only because they implement paste themselves via
			// the command system / ClipboardAddon; we rely on xterm's built-in paste
			// listener, so the default must run.
			return false;
		}

		return true;
	};
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
	_disposeResizeObserver: (() => void) | null;
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

// Body-level hidden container that owns wrapper divs of terminals whose
// React component is currently unmounted (e.g. workspace switch). Keeps
// xterm attached to the document so it survives provider remounts without
// a detach/reattach flash — VSCode's setVisible(false) model. Looked up
// by DOM id so it's HMR-safe (module-level `let` would leak on re-eval).
// `inert` removes the whole subtree from the tab order and the accessibility
// tree, and also moves focus out of it — so a parked terminal's internal
// <textarea> can't receive keystrokes meant for the active pane.
const PARKING_CONTAINER_ID = "v2-terminal-parking";
function getParkingContainer(): HTMLDivElement {
	const existing = document.getElementById(PARKING_CONTAINER_ID);
	if (existing) return existing as HTMLDivElement;

	const el = document.createElement("div");
	el.id = PARKING_CONTAINER_ID;
	el.setAttribute("inert", "");
	el.setAttribute("aria-hidden", "true");
	el.style.position = "fixed";
	el.style.left = "-9999px";
	el.style.top = "-9999px";
	el.style.width = "100vw";
	el.style.height = "100vh";
	el.style.overflow = "hidden";
	el.style.pointerEvents = "none";
	document.body.appendChild(el);
	return el;
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

export function createRuntime(
	terminalId: string,
	appearance: TerminalAppearance,
	options: { initialBuffer?: string } = {},
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

	terminal.attachCustomKeyEventHandler(createKeyEventHandler(terminal));

	// Activate Unicode 11 widths (inside loadAddons) before restoring the buffer,
	// else CJK/emoji/ZWJ widths get baked wrong into the replay. (#3572)
	const addonsResult = loadAddons(terminal);
	if (options.initialBuffer !== undefined) {
		terminal.write(options.initialBuffer);
	} else {
		restoreBuffer(terminalId, terminal);
	}

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
	// see getParkingContainer.
	getParkingContainer().appendChild(runtime.wrapper);
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
