import { FitAddon } from "@xterm/addon-fit";
import type { ProgressAddon } from "@xterm/addon-progress";
import type { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Terminal as XTerm } from "@xterm/xterm";
import { DEFAULT_TERMINAL_SCROLLBACK } from "shared/constants";
import type { TerminalAppearance } from "./appearance";
import { loadAddons } from "./terminal-addons";
import { installImagePasteFallback } from "./terminal-image-paste-fallback";
import { installTerminalKeyEventHandler } from "./terminal-key-event-handler";
import { getTerminalParkingContainer } from "./terminal-parking";
import { markTerminalSessionReplayBlocked } from "./terminal-session-replay";

const SERIALIZE_SCROLLBACK = 1000;
const STORAGE_KEY_PREFIX = "terminal-buffer:";
const DIMS_KEY_PREFIX = "terminal-dims:";
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;
const RESIZE_DEBOUNCE_MS = 75;
const OUTPUT_CHUNK_BYTES = 4096;
const BACKGROUND_OUTPUT_WRITES_PER_FRAME = 2;
const MAX_PARKED_OUTPUT_QUEUE_BYTES = 1024 * 1024;

type TerminalOutputData = string | Uint8Array;

interface TerminalOutputQueueItem {
	data: TerminalOutputData;
	byteLength: number;
	callback?: () => void;
}

const runtimesWithQueuedOutput = new Set<TerminalRuntime>();
let outputFlushRafId: number | null = null;
let outputFlushTimeoutId: ReturnType<typeof setTimeout> | null = null;
let pendingFocusRuntime: TerminalRuntime | null = null;
let focusRafId: number | null = null;

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
	_disposeImagePasteFallback: (() => void) | null;
	_outputQueue: TerminalOutputQueueItem[];
	_outputEnqueued: boolean;
	_outputQueuedBytes: number;
	hasBufferedContent: boolean;
}

function getOutputByteLength(data: TerminalOutputData): number {
	if (typeof data === "string") return data.length;
	return data.byteLength;
}

function splitStringAtOutputBoundary(value: string, start: number): number {
	const end = Math.min(value.length, start + OUTPUT_CHUNK_BYTES);
	if (end >= value.length) return value.length;
	const code = value.charCodeAt(end - 1);
	return code >= 0xd800 && code <= 0xdbff ? end - 1 : end;
}

function splitOutputData(
	data: TerminalOutputData,
	callback?: () => void,
): TerminalOutputQueueItem[] {
	const byteLength = getOutputByteLength(data);
	if (byteLength <= OUTPUT_CHUNK_BYTES) {
		return [{ data, byteLength, callback }];
	}

	const items: TerminalOutputQueueItem[] = [];
	if (typeof data === "string") {
		for (let start = 0; start < data.length; ) {
			const end = splitStringAtOutputBoundary(data, start);
			const chunk = data.slice(start, end);
			items.push({ data: chunk, byteLength: chunk.length });
			start = end;
		}
	} else {
		for (let start = 0; start < data.byteLength; start += OUTPUT_CHUNK_BYTES) {
			const chunk = data.slice(start, start + OUTPUT_CHUNK_BYTES);
			items.push({ data: chunk, byteLength: chunk.byteLength });
		}
	}

	const lastItem = items.at(-1);
	if (lastItem) lastItem.callback = callback;
	return items;
}

function scheduleQueuedOutputFlush() {
	if (outputFlushRafId !== null || outputFlushTimeoutId !== null) return;
	if (typeof requestAnimationFrame !== "function") {
		outputFlushTimeoutId = setTimeout(flushQueuedOutput, 0);
		return;
	}
	outputFlushRafId = requestAnimationFrame(flushQueuedOutput);
}

function flushQueuedOutput() {
	outputFlushRafId = null;
	if (outputFlushTimeoutId !== null) {
		clearTimeout(outputFlushTimeoutId);
		outputFlushTimeoutId = null;
	}

	let processed = 0;
	for (const runtime of Array.from(runtimesWithQueuedOutput)) {
		runtimesWithQueuedOutput.delete(runtime);
		if (!runtime.container) {
			runtime._outputEnqueued = false;
			continue;
		}
		const item = runtime._outputQueue.shift();
		if (!item) {
			runtime._outputEnqueued = false;
			continue;
		}

		processed += 1;
		runtime._outputQueuedBytes = Math.max(
			0,
			runtime._outputQueuedBytes - item.byteLength,
		);
		runtime.terminal.write(item.data, item.callback);

		if (runtime._outputQueue.length > 0) {
			runtimesWithQueuedOutput.add(runtime);
		} else {
			runtime._outputEnqueued = false;
		}

		if (processed >= BACKGROUND_OUTPUT_WRITES_PER_FRAME) break;
	}

	if (runtimesWithQueuedOutput.size > 0) {
		scheduleQueuedOutputFlush();
	}
}

function enqueueRuntimeOutput(
	runtime: TerminalRuntime,
	item: TerminalOutputQueueItem,
) {
	runtime._outputQueuedBytes += item.byteLength;
	runtime._outputQueue.push(item);
	if (!runtime.container) {
		item.callback?.();
		item.callback = undefined;
		while (
			runtime._outputQueuedBytes > MAX_PARKED_OUTPUT_QUEUE_BYTES &&
			runtime._outputQueue.length > 1
		) {
			const dropped = runtime._outputQueue.shift();
			if (!dropped) break;
			runtime._outputQueuedBytes = Math.max(
				0,
				runtime._outputQueuedBytes - dropped.byteLength,
			);
			dropped.callback?.();
		}
		return;
	}
	if (!runtime._outputEnqueued) {
		runtime._outputEnqueued = true;
		runtimesWithQueuedOutput.add(runtime);
	}
	scheduleQueuedOutputFlush();
}

function clearQueuedRuntimeOutput(runtime: TerminalRuntime) {
	runtimesWithQueuedOutput.delete(runtime);
	runtime._outputEnqueued = false;
	runtime._outputQueuedBytes = 0;
	const queue = runtime._outputQueue.splice(0);
	for (const item of queue) {
		item.callback?.();
	}
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

function restoreBuffer(terminalId: string, terminal: XTerm): boolean {
	try {
		const data = localStorage.getItem(`${STORAGE_KEY_PREFIX}${terminalId}`);
		if (data) {
			terminal.write(data);
			return true;
		}
	} catch {}
	return false;
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

function disposeTerminalAfterPendingRefresh(terminal: XTerm) {
	const disposeTerminal = () => {
		try {
			terminal.dispose();
		} catch {}
	};

	if (typeof requestAnimationFrame !== "function") {
		setTimeout(disposeTerminal, 0);
		return;
	}

	requestAnimationFrame(() => {
		requestAnimationFrame(disposeTerminal);
	});
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
	markTerminalSessionReplayBlocked(wrapper);
	terminal.open(wrapper);

	installTerminalKeyEventHandler(terminal);

	// Activate Unicode 11 widths (inside loadAddons) before restoring the buffer,
	// else CJK/emoji/ZWJ widths get baked wrong into the replay. (#3572)
	const addonsResult = loadAddons(terminal);
	let hasBufferedContent = false;
	if (options.initialBuffer !== undefined) {
		if (options.initialBuffer.length > 0) {
			terminal.write(options.initialBuffer);
			hasBufferedContent = true;
		}
	} else {
		hasBufferedContent = restoreBuffer(terminalId, terminal);
	}

	const disposeImagePasteFallback = installImagePasteFallback(
		terminal,
		wrapper,
	);

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
		_disposeImagePasteFallback: disposeImagePasteFallback,
		_outputQueue: [],
		_outputEnqueued: false,
		_outputQueuedBytes: 0,
		hasBufferedContent,
	};
}

export function shouldReplayTerminalRuntime(runtime: TerminalRuntime): boolean {
	return !runtime.hasBufferedContent;
}

export function writeRuntimeOutput(
	runtime: TerminalRuntime,
	data: TerminalOutputData,
	callback?: () => void,
) {
	const items = splitOutputData(data, callback);
	if (items.some((item) => item.byteLength > 0)) {
		runtime.hasBufferedContent = true;
	}
	if (
		runtime.container &&
		runtime._outputQueue.length === 0 &&
		items.length === 1
	) {
		runtime.terminal.write(data, callback);
		return;
	}
	for (const item of items) {
		enqueueRuntimeOutput(runtime, item);
	}
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

	if (runtime._outputQueue.length > 0 && !runtime._outputEnqueued) {
		runtime._outputEnqueued = true;
		runtimesWithQueuedOutput.add(runtime);
		scheduleQueuedOutputFlush();
	}
}

function focusRuntimeNow(runtime: TerminalRuntime) {
	if (!runtime.container) return;
	const element = runtime.terminal.element;
	if (element?.contains(document.activeElement)) return;
	const textarea = runtime.terminal.textarea;
	if (textarea) {
		textarea.focus({ preventScroll: true });
		return;
	}
	runtime.terminal.focus();
}

export function focusRuntime(runtime: TerminalRuntime) {
	pendingFocusRuntime = runtime;
	if (focusRafId !== null) return;
	focusRafId = requestAnimationFrame(() => {
		focusRafId = null;
		const nextRuntime = pendingFocusRuntime;
		pendingFocusRuntime = null;
		if (nextRuntime) focusRuntimeNow(nextRuntime);
	});
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
	runtime._disposeImagePasteFallback?.();
	runtime._disposeImagePasteFallback = null;
	runtime._disposeAddons?.();
	runtime._disposeAddons = null;
	clearQueuedRuntimeOutput(runtime);
	runtime._disposeResizeObserver?.();
	runtime._disposeResizeObserver = null;
	runtime.resizeObserver?.disconnect();
	runtime.resizeObserver = null;
	runtime.wrapper.remove();
	if (clearPersistedState) {
		clearPersistedBuffer(runtime.terminalId);
		clearPersistedDimensions(runtime.terminalId);
	}
	disposeTerminalAfterPendingRefresh(runtime.terminal);
}
