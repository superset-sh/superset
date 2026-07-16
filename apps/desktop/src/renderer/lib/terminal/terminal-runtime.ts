import { installTerminalWheelEventHandler } from "@superset/shared/terminal-wheel-handler";
import { FitAddon } from "@xterm/addon-fit";
import type { ProgressAddon } from "@xterm/addon-progress";
import type { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Terminal as XTerm } from "@xterm/xterm";
import { DEFAULT_TERMINAL_SCROLLBACK } from "shared/constants";
import {
	applyTerminalFontFamilyCssVariable,
	type TerminalAppearance,
} from "./appearance";
import { scheduleFontSettleRefit } from "./font-settle";
import {
	cancelParserIdleWork,
	createParserIdleGate,
	type ParserIdleGate,
	runWhenParserIdle,
	wrapWrite,
} from "./parser-idle-gate";
import { loadAddons } from "./terminal-addons";
import { installImagePasteFallback } from "./terminal-image-paste-fallback";
import { installTerminalKeyEventHandler } from "./terminal-key-event-handler";
import { getTerminalParkingContainer } from "./terminal-parking";

const SERIALIZE_SCROLLBACK = 1000;
const STORAGE_KEY_PREFIX = "terminal-buffer:";
const RECOVERY_STORAGE_KEY_PREFIX = "terminal-recovery:";
const STATE_KEY_PREFIX = "terminal-state-v2:";
const MIN_ATOMIC_RESTORABLE_CONTENT_SCORE = 1;
const MIN_RESTORABLE_CONTENT_SCORE = 1000;
const DIMS_KEY_PREFIX = "terminal-dims:";
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;
const RESIZE_DEBOUNCE_MS = 75;
const PERSIST_DEBOUNCE_MS = 250;
export const PERSISTED_REPLAY_ANCHOR_BYTES = 4 * 1024;
// biome-ignore lint/complexity/useRegexLiterals: constructor avoids the control-character literal lint while matching serialized ANSI sequences.
const OSC_CONTROL_SEQUENCE = new RegExp(
	"\\x1b\\][^\\x07]*(?:\\x07|\\x1b\\\\)",
	"g",
);
// biome-ignore lint/complexity/useRegexLiterals: constructor avoids the control-character literal lint while matching serialized ANSI sequences.
const ANSI_CONTROL_SEQUENCE = new RegExp(
	"\\x1b(?:\\[[0-?]*[ -/]*[@-~]|[@-_])",
	"g",
);

export interface PersistedTerminalState {
	data: string;
	cols: number;
	rows: number;
	replayCheckpoint: Uint8Array;
}

interface LivePersistence {
	schedule: () => void;
	flush: () => boolean;
	getReplayCheckpoint: () => Uint8Array;
	setReplayCheckpoint: (checkpoint: Uint8Array) => void;
	dispose: () => void;
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
	gate: ParserIdleGate;
	resizeObserver: ResizeObserver | null;
	_disposeResizeObserver: (() => void) | null;
	lastCols: number;
	lastRows: number;
	restoredFromBuffer: boolean;
	_persistence: LivePersistence | null;
	_disposeAddons: (() => void) | null;
	_disposeImagePasteFallback: (() => void) | null;
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

function encodePersistedState(
	cols: number,
	rows: number,
	data: string,
	replayCheckpoint: Uint8Array,
): string {
	const boundedCheckpoint = replayCheckpoint.subarray(
		Math.max(0, replayCheckpoint.byteLength - PERSISTED_REPLAY_ANCHOR_BYTES),
	);
	let binary = "";
	const chunkSize = 0x8000;
	for (
		let offset = 0;
		offset < boundedCheckpoint.byteLength;
		offset += chunkSize
	) {
		binary += String.fromCharCode(
			...boundedCheckpoint.subarray(offset, offset + chunkSize),
		);
	}
	return `v3;${cols};${rows};${btoa(binary)}\n${data}`;
}

function decodePersistedState(
	raw: string | null,
): PersistedTerminalState | null {
	if (!raw?.startsWith("v2;") && !raw?.startsWith("v3;")) return null;
	const newline = raw.indexOf("\n");
	if (newline < 0) return null;
	const version = raw.slice(0, 2);
	const header = raw.slice(3, newline).split(";");
	if (header.length !== (version === "v3" ? 3 : 2)) return null;
	const cols = Number(header[0]);
	const rows = Number(header[1]);
	if (
		!Number.isInteger(cols) ||
		!Number.isInteger(rows) ||
		cols < 2 ||
		rows < 1
	) {
		return null;
	}
	let replayCheckpoint = new Uint8Array();
	if (version === "v3") {
		try {
			const binary = atob(header[2] ?? "");
			replayCheckpoint = Uint8Array.from(binary, (char) => char.charCodeAt(0));
			if (replayCheckpoint.byteLength > PERSISTED_REPLAY_ANCHOR_BYTES) {
				replayCheckpoint = replayCheckpoint.slice(
					replayCheckpoint.byteLength - PERSISTED_REPLAY_ANCHOR_BYTES,
				);
			}
		} catch {
			return null;
		}
	}
	return { cols, rows, data: raw.slice(newline + 1), replayCheckpoint };
}

export function persistState(
	terminalId: string,
	terminal: XTerm,
	serializeAddon: SerializeAddon,
	replayCheckpoint: Uint8Array = new Uint8Array(),
): boolean {
	let data: string;
	let cols: number;
	let rows: number;
	try {
		data = serializeAddon.serialize({ scrollback: SERIALIZE_SCROLLBACK });
		cols = terminal.cols;
		rows = terminal.rows;
		localStorage.setItem(
			`${STATE_KEY_PREFIX}${terminalId}`,
			encodePersistedState(cols, rows, data, replayCheckpoint),
		);
	} catch {
		return false;
	}

	// Keep the legacy keys as rollback/fallback copies. They are best-effort:
	// the versioned state key above is the source of truth because its buffer,
	// dimensions, and raw replay checkpoint share one atomic localStorage write.
	try {
		localStorage.setItem(`${STORAGE_KEY_PREFIX}${terminalId}`, data);
	} catch {}
	try {
		localStorage.setItem(
			`${DIMS_KEY_PREFIX}${terminalId}`,
			JSON.stringify({ cols, rows }),
		);
	} catch {}
	return true;
}

function installLivePersistence(
	terminalId: string,
	terminal: XTerm,
	serializeAddon: SerializeAddon,
	initialReplayCheckpoint: Uint8Array,
): LivePersistence {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	let replayCheckpoint = initialReplayCheckpoint.slice(
		Math.max(
			0,
			initialReplayCheckpoint.byteLength - PERSISTED_REPLAY_ANCHOR_BYTES,
		),
	);
	const flush = () => {
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
		return persistState(terminalId, terminal, serializeAddon, replayCheckpoint);
	};
	const schedule = () => {
		if (timeoutId !== null) clearTimeout(timeoutId);
		timeoutId = setTimeout(flush, PERSIST_DEBOUNCE_MS);
	};
	const parsedDisposable = terminal.onWriteParsed(schedule);
	window.addEventListener("beforeunload", flush);
	return {
		schedule,
		flush,
		getReplayCheckpoint: () => replayCheckpoint,
		setReplayCheckpoint: (checkpoint) => {
			replayCheckpoint = checkpoint.slice(
				Math.max(0, checkpoint.byteLength - PERSISTED_REPLAY_ANCHOR_BYTES),
			);
		},
		dispose: () => {
			parsedDisposable.dispose();
			window.removeEventListener("beforeunload", flush);
			flush();
		},
	};
}

function terminalContentScore(data: string): number {
	return data
		.replace(OSC_CONTROL_SEQUENCE, "")
		.replace(ANSI_CONTROL_SEQUENCE, "")
		.replace(/\s/g, "").length;
}

export function loadRestorableState(
	terminalId: string,
): PersistedTerminalState | null {
	try {
		const atomicState = decodePersistedState(
			localStorage.getItem(`${STATE_KEY_PREFIX}${terminalId}`),
		);
		if (
			atomicState &&
			terminalContentScore(atomicState.data) >=
				MIN_ATOMIC_RESTORABLE_CONTENT_SCORE
		) {
			return atomicState;
		}

		const legacyData = localStorage.getItem(
			`${STORAGE_KEY_PREFIX}${terminalId}`,
		);
		let data =
			legacyData &&
			terminalContentScore(legacyData) >= MIN_RESTORABLE_CONTENT_SCORE
				? legacyData
				: null;
		if (!data) {
			const recovery = localStorage.getItem(
				`${RECOVERY_STORAGE_KEY_PREFIX}${terminalId}`,
			);
			if (recovery) data = recovery;
		}
		if (data) {
			const dimensions = loadSavedDimensions(terminalId);
			return {
				data,
				cols: dimensions?.cols ?? DEFAULT_COLS,
				rows: dimensions?.rows ?? DEFAULT_ROWS,
				replayCheckpoint: new Uint8Array(),
			};
		}
	} catch {}
	return null;
}

function clearPersistedBuffer(terminalId: string) {
	try {
		localStorage.removeItem(`${STORAGE_KEY_PREFIX}${terminalId}`);
		localStorage.removeItem(`${STATE_KEY_PREFIX}${terminalId}`);
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

function measureAndResize(
	runtime: TerminalRuntime,
	onResize?: () => void,
): void {
	if (!hostIsVisible(runtime.container)) return;
	const { terminal } = runtime;

	runWhenParserIdle(runtime.gate, () => {
		if (!hostIsVisible(runtime.container)) return;

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

		if (terminal.cols !== prevCols || terminal.rows !== prevRows) {
			runtime._persistence?.schedule();
			onResize?.();
		}
	});
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
		measureAndResize(runtime, onResize);
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
	options: {
		initialBuffer?: string;
		initialState?: PersistedTerminalState;
		initialCols?: number;
		initialRows?: number;
	} = {},
): TerminalRuntime {
	const restoredState =
		options.initialState ??
		(options.initialBuffer !== undefined
			? {
					data: options.initialBuffer,
					cols:
						options.initialCols ??
						loadSavedDimensions(terminalId)?.cols ??
						DEFAULT_COLS,
					rows:
						options.initialRows ??
						loadSavedDimensions(terminalId)?.rows ??
						DEFAULT_ROWS,
					replayCheckpoint: new Uint8Array(),
				}
			: loadRestorableState(terminalId));
	const cols = restoredState?.cols ?? DEFAULT_COLS;
	const rows = restoredState?.rows ?? DEFAULT_ROWS;

	const { terminal, fitAddon, serializeAddon } = createTerminal(
		cols,
		rows,
		appearance,
	);

	const gate = createParserIdleGate();
	terminal.write = wrapWrite(gate, terminal.write.bind(terminal));

	const wrapper = document.createElement("div");
	wrapper.style.width = "100%";
	wrapper.style.height = "100%";
	applyTerminalFontFamilyCssVariable(wrapper, appearance.fontFamily);
	terminal.open(wrapper);

	installTerminalKeyEventHandler(terminal);
	installTerminalWheelEventHandler(terminal);

	// Activate Unicode 11 widths (inside loadAddons) before restoring the buffer,
	// else CJK/emoji/ZWJ widths get baked wrong into the replay. (#3572)
	const addonsResult = loadAddons(terminal);
	const restoredFromBuffer = Boolean(
		restoredState?.data &&
			terminalContentScore(restoredState.data) >=
				MIN_ATOMIC_RESTORABLE_CONTENT_SCORE,
	);
	if (restoredState?.data) terminal.write(restoredState.data);
	const persistence = installLivePersistence(
		terminalId,
		terminal,
		serializeAddon,
		restoredState?.replayCheckpoint ?? new Uint8Array(),
	);

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
		gate,
		resizeObserver: null,
		_disposeResizeObserver: null,
		lastCols: cols,
		lastRows: rows,
		restoredFromBuffer,
		_persistence: persistence,
		_disposeAddons: addonsResult.dispose,
		_disposeImagePasteFallback: disposeImagePasteFallback,
	};
}

export function attachToContainer(
	runtime: TerminalRuntime,
	container: HTMLDivElement,
	onResize?: () => void,
	options: { focus?: boolean } = {},
) {
	// If we're already attached to this exact container, do nothing. Prevents
	// redundant refresh/fit from transient remounts during provider key
	// churn — VSCode setVisible() is idempotent for the same host element.
	const sameContainer =
		runtime.container === container &&
		runtime.wrapper.parentElement === container;
	if (sameContainer && runtime.resizeObserver) {
		return;
	}

	runtime.container = container;
	container.appendChild(runtime.wrapper);
	measureAndResize(runtime, onResize);
	scheduleFontSettleRefit(
		runtime.terminal,
		() => hostIsVisible(runtime.container),
		() => measureAndResize(runtime, onResize),
	);

	runtime._disposeResizeObserver?.();
	runtime._disposeResizeObserver = null;
	runtime.resizeObserver?.disconnect();
	const scheduler = createResizeScheduler(runtime, onResize);
	const observer = new ResizeObserver(scheduler.observe);
	observer.observe(container);
	runtime.resizeObserver = observer;
	runtime._disposeResizeObserver = scheduler.dispose;

	if (options.focus !== false) {
		runtime.terminal.focus();
	}
}

export function detachFromContainer(runtime: TerminalRuntime) {
	runtime._persistence?.flush();
	runtime._disposeResizeObserver?.();
	runtime._disposeResizeObserver = null;
	runtime.resizeObserver?.disconnect();
	runtime.resizeObserver = null;
	cancelParserIdleWork(runtime.gate);
	// Park instead of .remove() so xterm survives the React unmount —
	// see getTerminalParkingContainer.
	getTerminalParkingContainer().appendChild(runtime.wrapper);
	runtime.container = null;
}

export function updateRuntimeAppearance(
	runtime: TerminalRuntime,
	appearance: TerminalAppearance,
	onResize?: () => void,
) {
	const { terminal } = runtime;
	terminal.options.theme = appearance.theme;

	const fontChanged =
		terminal.options.fontFamily !== appearance.fontFamily ||
		terminal.options.fontSize !== appearance.fontSize;

	if (fontChanged) {
		applyTerminalFontFamilyCssVariable(runtime.wrapper, appearance.fontFamily);
		terminal.options.fontFamily = appearance.fontFamily;
		terminal.options.fontSize = appearance.fontSize;
		measureAndResize(runtime, onResize);
		// The freshly-selected font may still be loading — schedule a follow-up
		// refit once it resolves so dimensions track the rendered glyphs.
		scheduleFontSettleRefit(
			runtime.terminal,
			() => hostIsVisible(runtime.container),
			() => measureAndResize(runtime, onResize),
		);
	}
}

export function disposeRuntime(
	runtime: TerminalRuntime,
	options: { clearPersistedState?: boolean } = {},
) {
	const clearPersistedState = options.clearPersistedState ?? true;
	const replayCheckpoint =
		runtime._persistence?.getReplayCheckpoint() ?? new Uint8Array();
	runtime._persistence?.dispose();
	runtime._persistence = null;
	if (!clearPersistedState) {
		persistState(
			runtime.terminalId,
			runtime.terminal,
			runtime.serializeAddon,
			replayCheckpoint,
		);
	}
	runtime._disposeImagePasteFallback?.();
	runtime._disposeImagePasteFallback = null;
	runtime._disposeAddons?.();
	runtime._disposeAddons = null;
	runtime._disposeResizeObserver?.();
	runtime._disposeResizeObserver = null;
	runtime.resizeObserver?.disconnect();
	runtime.resizeObserver = null;
	cancelParserIdleWork(runtime.gate);
	runtime.container = null;
	runtime.wrapper.remove();
	runtime.terminal.dispose();
	if (clearPersistedState) {
		clearPersistedBuffer(runtime.terminalId);
		clearPersistedDimensions(runtime.terminalId);
	}
}
