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
import { loadAddons } from "./terminal-addons";

const SERIALIZE_SCROLLBACK = 1000;
const STORAGE_KEY_PREFIX = "terminal-buffer:";
const DIMS_KEY_PREFIX = "terminal-dims:";
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;

// Diagnostic logging: always on. Watch DevTools console for `[kbd:*]` lines
// to see every onData byte, every kitty-flag push/set/pop, and every keydown
// that reaches our handler. Printable chars shown as-is, non-printable as \xNN.
function kbdDebugSkipOverride(): boolean {
	try {
		return (
			typeof localStorage !== "undefined" &&
			localStorage.getItem("__kbdDebugSkipOverride") === "1"
		);
	} catch {
		return false;
	}
}

function kbdHex(data: string): string {
	let out = "";
	for (const ch of data) {
		const cp = ch.codePointAt(0) ?? 0;
		out +=
			cp >= 0x20 && cp < 0x7f ? ch : `\\x${cp.toString(16).padStart(2, "0")}`;
	}
	return out;
}

function kbdLog(tag: string, data?: unknown): void {
	if (data === undefined) {
		console.log(`[kbd:${tag}]`);
		return;
	}
	if (typeof data === "string") {
		console.log(`[kbd:${tag}] ${data}`);
		return;
	}
	try {
		console.log(`[kbd:${tag}] ${JSON.stringify(data)}`);
	} catch {
		console.log(`[kbd:${tag}]`, data);
	}
}

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

/**
 * Mirror the running program's kitty progressive-enhancement flags so we can
 * gate canonical CSI-u injection (Shift+Enter etc.) on the program having
 * actually requested kitty mode. Matches how Ghostty / kitty / wezterm decide
 * whether to encode CSI-u vs legacy — see ghostty/src/input/key_encode.zig:88
 * and kitty/key_encoding.c:153.
 *
 * xterm.js v6.1-beta has its own internal tracker but doesn't expose the
 * active flags via public API, so we register our own CSI handlers alongside.
 * Returning `false` passes the sequence to xterm.js's built-in handler.
 */
function createKittyFlagTracker(terminal: XTerm): () => number {
	let flags = 0;
	const stack: number[] = [];

	const numeric = (p: number | number[] | undefined, fallback: number) => {
		if (typeof p === "number") return p;
		if (Array.isArray(p) && typeof p[0] === "number") return p[0];
		return fallback;
	};

	terminal.parser.registerCsiHandler({ prefix: ">", final: "u" }, (params) => {
		stack.push(flags);
		flags = numeric(params[0], 1);
		kbdLog("kitty-push", { flags, stackDepth: stack.length });
		return false;
	});

	terminal.parser.registerCsiHandler({ prefix: "=", final: "u" }, (params) => {
		const next = numeric(params[0], 0);
		const mode = numeric(params[1], 1);
		if (mode === 1) flags = next;
		else if (mode === 2) flags |= next;
		else if (mode === 3) flags &= ~next;
		kbdLog("kitty-set", { mode, next, flags });
		return false;
	});

	terminal.parser.registerCsiHandler({ prefix: "<", final: "u" }, (params) => {
		const levels = numeric(params[0], 1);
		for (let i = 0; i < levels; i++) flags = stack.pop() ?? 0;
		kbdLog("kitty-pop", { levels, flags, stackDepth: stack.length });
		return false;
	});

	return () => flags;
}

const KITTY_FLAG_DISAMBIGUATE = 0x01;
const KITTY_FLAG_REPORT_EVENTS = 0x02;

/**
 * Build the kitty CSI-u press sequence for Shift+Enter in the exact form the
 * running program expects, based on the flags it has pushed.
 *
 * - With only disambiguate (0x01): "\x1b[13;2u"
 * - With report-events (0x02) also active: "\x1b[13;2:1u" (explicit press
 *   event type). Observed empirically: xterm.js emits event-type-suffixed
 *   sequences when the program activates 0x02 (Escape release was
 *   "\x1b[27;1:3u" in the diagnostic trace), and claude-code's parser appears
 *   to require the explicit suffix when it has requested the event-type flag.
 */
function shiftEnterCsiU(flags: number): string {
	if ((flags & KITTY_FLAG_REPORT_EVENTS) !== 0) return "\x1b[13;2:1u";
	return "\x1b[13;2u";
}

function createKeyEventHandler(terminal: XTerm, getKittyFlags: () => number) {
	const platform =
		typeof navigator !== "undefined" ? navigator.platform.toLowerCase() : "";
	const isMac = platform.includes("mac");
	const isWindows = platform.includes("win");

	return (event: KeyboardEvent): boolean => {
		if (event.type === "keydown" || event.type === "keyup") {
			const mods =
				[
					event.metaKey && "Meta",
					event.ctrlKey && "Ctrl",
					event.altKey && "Alt",
					event.shiftKey && "Shift",
				]
					.filter(Boolean)
					.join("+") || "none";
			kbdLog(event.type, {
				key: event.key,
				code: event.code,
				mods,
				kittyFlags: getKittyFlags(),
			});
		}

		if (resolveHotkeyFromEvent(event) !== null) return false;

		// Shift+Enter when the running program has pushed kitty's disambiguate
		// flag: emit the canonical CSI-u form so claude-code (which only
		// accepts `\x1b[13;2u`) inserts a newline instead of submitting.
		// xterm.js's own kitty encoder can vary by flag set — Codex's crossterm
		// parser tolerates the variance but claude-code does not. Gated like
		// Ghostty: only when the program is in kitty mode, so pre-kitty shells
		// still see plain `\r` and behave normally.
		if (
			event.key === "Enter" &&
			event.shiftKey &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.altKey &&
			(getKittyFlags() & KITTY_FLAG_DISAMBIGUATE) !== 0 &&
			!kbdDebugSkipOverride()
		) {
			if (event.type === "keydown") {
				const seq = shiftEnterCsiU(getKittyFlags());
				event.preventDefault();
				kbdLog("override", `Shift+Enter → ${kbdHex(seq)}`);
				terminal.input(seq, true);
			}
			return false;
		}

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
			return false;
		}

		return true;
	};
}

/**
 * Translate Mac Cmd+/Option+ and Windows Ctrl+ arrow / backspace chords into
 * the escape sequences shells expect. Returns the bytes to send, or null if
 * this chord isn't a line-edit translation.
 *
 * Mirrors v1 helpers.ts:319-427. These translations only exist because xterm's
 * default encoding (with kitty on) would send a CSI-u sequence that most
 * shells don't map to line-edit commands.
 */
function translateLineEditChord(
	event: KeyboardEvent,
	options: { isMac: boolean; isWindows: boolean },
): string | null {
	const { isMac, isWindows } = options;

	if (
		isMac &&
		event.key === "Backspace" &&
		event.metaKey &&
		!event.ctrlKey &&
		!event.altKey &&
		!event.shiftKey
	) {
		return "\x15\x1b[D";
	}

	if (
		isMac &&
		event.key === "ArrowLeft" &&
		event.metaKey &&
		!event.ctrlKey &&
		!event.altKey &&
		!event.shiftKey
	) {
		return "\x01";
	}

	if (
		isMac &&
		event.key === "ArrowRight" &&
		event.metaKey &&
		!event.ctrlKey &&
		!event.altKey &&
		!event.shiftKey
	) {
		return "\x05";
	}

	if (
		isMac &&
		event.key === "ArrowLeft" &&
		event.altKey &&
		!event.metaKey &&
		!event.ctrlKey &&
		!event.shiftKey
	) {
		return "\x1bb";
	}

	if (
		isMac &&
		event.key === "ArrowRight" &&
		event.altKey &&
		!event.metaKey &&
		!event.ctrlKey &&
		!event.shiftKey
	) {
		return "\x1bf";
	}

	if (
		isWindows &&
		event.key === "ArrowLeft" &&
		event.ctrlKey &&
		!event.metaKey &&
		!event.altKey &&
		!event.shiftKey
	) {
		return "\x1bb";
	}

	if (
		isWindows &&
		event.key === "ArrowRight" &&
		event.ctrlKey &&
		!event.metaKey &&
		!event.altKey &&
		!event.shiftKey
	) {
		return "\x1bf";
	}

	return null;
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

function measureAndResize(runtime: TerminalRuntime) {
	if (!hostIsVisible(runtime.container)) return;
	runtime.fitAddon.fit();
	runtime.lastCols = runtime.terminal.cols;
	runtime.lastRows = runtime.terminal.rows;
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

	const getKittyFlags = createKittyFlagTracker(terminal);
	terminal.attachCustomKeyEventHandler(
		createKeyEventHandler(terminal, getKittyFlags),
	);

	terminal.onData((data) => {
		kbdLog("onData", {
			bytes: kbdHex(data),
			length: data.length,
			kittyFlags: getKittyFlags(),
		});
	});

	// Activate Unicode 11 widths (inside loadAddons) before restoring the buffer,
	// else CJK/emoji/ZWJ widths get baked wrong into the replay. (#3572)
	const addonsResult = loadAddons(terminal);
	restoreBuffer(terminalId, terminal);

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
	runtime.container = container;
	container.appendChild(runtime.wrapper);
	measureAndResize(runtime);

	// Renderer may have skipped frames while the wrapper was detached.
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
	const { terminal, fitAddon } = runtime;
	terminal.options.theme = appearance.theme;

	const fontChanged =
		terminal.options.fontFamily !== appearance.fontFamily ||
		terminal.options.fontSize !== appearance.fontSize;

	if (fontChanged) {
		terminal.options.fontFamily = appearance.fontFamily;
		terminal.options.fontSize = appearance.fontSize;
		if (hostIsVisible(runtime.container)) {
			fitAddon.fit();
			runtime.lastCols = terminal.cols;
			runtime.lastRows = terminal.rows;
		}
	}
}

export function disposeRuntime(runtime: TerminalRuntime) {
	runtime._disposeAddons?.();
	runtime._disposeAddons = null;
	runtime.resizeObserver?.disconnect();
	runtime.resizeObserver = null;
	runtime.wrapper.remove();
	runtime.terminal.dispose();
	clearPersistedBuffer(runtime.terminalId);
	clearPersistedDimensions(runtime.terminalId);
}
