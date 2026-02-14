import { toast } from "@superset/ui/sonner";
import type { ITheme } from "ghostty-web";
import { FitAddon, Terminal as XTerm } from "ghostty-web";
import { debounce } from "lodash";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import { getHotkeyKeys, isAppHotkeyEvent } from "renderer/stores/hotkeys";
import { toXtermTheme } from "renderer/stores/theme/utils";
import {
	getCurrentPlatform,
	hotkeyFromKeyboardEvent,
	isTerminalReservedEvent,
	matchesHotkeyEvent,
} from "shared/hotkeys";
import {
	builtInThemes,
	DEFAULT_THEME_ID,
	getTerminalColors,
} from "shared/themes";
import { RESIZE_DEBOUNCE_MS, TERMINAL_OPTIONS } from "./config";
import { ensureGhosttyReady, getGhosttyInstance } from "./ghostty-init";
import { FilePathLinkProvider, UrlLinkProvider } from "./link-providers";
import { scrollToBottom } from "./utils";

/**
 * Get the default terminal theme from localStorage cache.
 * This reads cached terminal colors before store hydration to prevent flash.
 * Supports both built-in and custom themes via direct color cache.
 */
export function getDefaultTerminalTheme(): ITheme {
	try {
		// First try cached terminal colors (works for all themes including custom)
		const cachedTerminal = localStorage.getItem("theme-terminal");
		if (cachedTerminal) {
			return toXtermTheme(JSON.parse(cachedTerminal));
		}
		// Fallback to looking up by theme ID (for fresh installs before first theme apply)
		const themeId = localStorage.getItem("theme-id") ?? DEFAULT_THEME_ID;
		const theme = builtInThemes.find((t) => t.id === themeId);
		if (theme) {
			return toXtermTheme(getTerminalColors(theme));
		}
	} catch {
		// Fall through to default
	}
	// Final fallback to default theme
	const defaultTheme = builtInThemes.find((t) => t.id === DEFAULT_THEME_ID);
	return defaultTheme
		? toXtermTheme(getTerminalColors(defaultTheme))
		: { background: "#1a1a1a", foreground: "#d4d4d4" };
}

/**
 * Get the default terminal background based on stored theme.
 * This reads from localStorage before store hydration to prevent flash.
 */
export function getDefaultTerminalBg(): string {
	return getDefaultTerminalTheme().background ?? "#1a1a1a";
}

export interface CreateTerminalOptions {
	cwd?: string;
	initialTheme?: ITheme | null;
	onFileLinkClick?: (path: string, line?: number, column?: number) => void;
}

export async function createTerminalInstance(
	container: HTMLDivElement,
	options: CreateTerminalOptions = {},
): Promise<{
	xterm: XTerm;
	fitAddon: FitAddon;
	cleanup: () => void;
}> {
	await ensureGhosttyReady();

	const { cwd, initialTheme, onFileLinkClick } = options;

	// Use provided theme, or fall back to localStorage-based default to prevent flash
	const theme = initialTheme ?? getDefaultTerminalTheme();
	const ghostty = getGhosttyInstance();
	const terminalOptions = { ...TERMINAL_OPTIONS, theme, ghostty };
	const xterm = new XTerm(terminalOptions);
	const fitAddon = new FitAddon();

	// Track cleanup state to prevent operations on disposed terminal
	let _isDisposed = false;

	xterm.loadAddon(fitAddon);
	xterm.open(container);

	const urlLinkProvider = new UrlLinkProvider(xterm, (_event, uri) => {
		trpcClient.external.openUrl.mutate(uri).catch((error) => {
			console.error("[Terminal] Failed to open URL:", uri, error);
			toast.error("Failed to open URL", {
				description:
					error instanceof Error
						? error.message
						: "Could not open URL in browser",
			});
		});
	});
	xterm.registerLinkProvider(urlLinkProvider);

	const filePathLinkProvider = new FilePathLinkProvider(
		xterm,
		(_event, path, line, column) => {
			if (onFileLinkClick) {
				onFileLinkClick(path, line, column);
			} else {
				// Fallback to default behavior (external editor)
				trpcClient.external.openFileInEditor
					.mutate({
						path,
						line,
						column,
						cwd,
					})
					.catch((error) => {
						console.error(
							"[Terminal] Failed to open file in editor:",
							path,
							error,
						);
					});
			}
		},
	);
	xterm.registerLinkProvider(filePathLinkProvider);

	fitAddon.fit();

	return {
		xterm,
		fitAddon,
		cleanup: () => {
			_isDisposed = true;
		},
	};
}

export interface KeyboardHandlerOptions {
	/** Callback for Shift+Enter (sends ESC+CR to avoid \ appearing in Claude Code while keeping line continuation behavior) */
	onShiftEnter?: () => void;
	/** Callback for the configured clear terminal shortcut */
	onClear?: () => void;
	onWrite?: (data: string) => void;
}

export interface PasteHandlerOptions {
	/** Callback when text is pasted, receives the pasted text */
	onPaste?: (text: string) => void;
	/** Optional direct write callback to bypass xterm's paste burst */
	onWrite?: (data: string) => void;
	/** Whether bracketed paste mode is enabled for the current terminal */
	isBracketedPasteEnabled?: () => boolean;
}

/**
 * Setup copy handler for xterm to trim trailing whitespace from copied text.
 *
 * Terminal emulators fill lines with whitespace to pad to the terminal width.
 * When copying text, this results in unwanted trailing spaces on each line.
 * This handler intercepts copy events and trims trailing whitespace from each
 * line before writing to the clipboard.
 *
 * Returns a cleanup function to remove the handler.
 */
export function setupCopyHandler(xterm: XTerm): () => void {
	const element = xterm.element;
	if (!element) return () => {};

	const handleCopy = (event: ClipboardEvent) => {
		const selection = xterm.getSelection();
		if (!selection) return;

		// Trim trailing whitespace from each line while preserving intentional newlines
		const trimmedText = selection
			.split("\n")
			.map((line) => line.trimEnd())
			.join("\n");

		event.preventDefault();
		event.clipboardData?.setData("text/plain", trimmedText);
	};

	element.addEventListener("copy", handleCopy);

	return () => {
		element.removeEventListener("copy", handleCopy);
	};
}

/**
 * Setup paste handler for xterm to ensure bracketed paste mode works correctly.
 *
 * xterm.js's built-in paste handling via the textarea should work, but in some
 * Electron environments the clipboard events may not propagate correctly.
 * This handler explicitly intercepts paste events and uses xterm's paste() method,
 * which properly handles bracketed paste mode (wrapping pasted content with
 * \x1b[200~ and \x1b[201~ escape sequences when the shell has enabled it).
 *
 * This is required for TUI applications like opencode, vim, etc. that expect
 * bracketed paste mode to distinguish between typed and pasted content.
 *
 * Returns a cleanup function to remove the handler.
 */
export function setupPasteHandler(
	xterm: XTerm,
	options: PasteHandlerOptions = {},
): () => void {
	// ghostty-web handles paste on the container element (contenteditable div) via its
	// InputHandler, which sends raw text without bracketed paste wrapping. We attach to
	// the container's PARENT element with capture to intercept paste events during the
	// capture phase, before ghostty-web's handlers on the container or textarea fire.
	const parentEl = xterm.element?.parentElement;
	if (!parentEl) return () => {};

	let cancelActivePaste: (() => void) | null = null;

	const handlePaste = (event: ClipboardEvent) => {
		const text = event.clipboardData?.getData("text/plain");
		if (!text) return;

		event.preventDefault();
		event.stopPropagation();

		options.onPaste?.(text);

		// Cancel any in-flight chunked paste to avoid overlapping writes.
		cancelActivePaste?.();
		cancelActivePaste = null;

		// Chunk large pastes to avoid sending a single massive input burst that can
		// overwhelm the PTY pipeline (especially when the app is repainting heavily).
		const MAX_SYNC_PASTE_CHARS = 16_384;

		// If no direct write callback is provided, fall back to xterm's paste()
		// (it handles newline normalization and bracketed paste mode internally).
		if (!options.onWrite) {
			const CHUNK_CHARS = 4096;
			const CHUNK_DELAY_MS = 5;

			if (text.length <= MAX_SYNC_PASTE_CHARS) {
				xterm.paste(text);
				return;
			}

			let cancelled = false;
			let offset = 0;

			const pasteNext = () => {
				if (cancelled) return;

				const chunk = text.slice(offset, offset + CHUNK_CHARS);
				offset += CHUNK_CHARS;
				xterm.paste(chunk);

				if (offset < text.length) {
					setTimeout(pasteNext, CHUNK_DELAY_MS);
				}
			};

			cancelActivePaste = () => {
				cancelled = true;
			};

			pasteNext();
			return;
		}

		// Direct write path: replicate xterm's paste normalization, but stream in
		// controlled chunks while preserving bracketed-paste semantics.
		const preparedText = text.replace(/\r?\n/g, "\r");
		const bracketedPasteEnabled = options.isBracketedPasteEnabled?.() ?? false;
		const shouldBracket = bracketedPasteEnabled;

		// For small/medium pastes, preserve the fast path and avoid timers.
		if (preparedText.length <= MAX_SYNC_PASTE_CHARS) {
			options.onWrite(
				shouldBracket ? `\x1b[200~${preparedText}\x1b[201~` : preparedText,
			);
			return;
		}

		let cancelled = false;
		let offset = 0;
		const CHUNK_CHARS = 16_384;
		const CHUNK_DELAY_MS = 0;

		const pasteNext = () => {
			if (cancelled) return;

			const chunk = preparedText.slice(offset, offset + CHUNK_CHARS);
			offset += CHUNK_CHARS;

			if (shouldBracket) {
				// Wrap each chunk to avoid long-running "open" bracketed paste blocks,
				// which some TUIs may defer repainting until the closing sequence arrives.
				options.onWrite?.(`\x1b[200~${chunk}\x1b[201~`);
			} else {
				options.onWrite?.(chunk);
			}

			if (offset < preparedText.length) {
				setTimeout(pasteNext, CHUNK_DELAY_MS);
				return;
			}
		};

		cancelActivePaste = () => {
			cancelled = true;
		};

		pasteNext();
	};

	parentEl.addEventListener("paste", handlePaste, { capture: true });

	return () => {
		cancelActivePaste?.();
		cancelActivePaste = null;
		parentEl.removeEventListener("paste", handlePaste, { capture: true });
	};
}

/**
 * Setup keyboard handling for xterm including:
 * - Shortcut forwarding: App hotkeys bubble to document where useAppHotkey listens
 * - Shift+Enter: Sends ESC+CR sequence (to avoid \ appearing in Claude Code while keeping line continuation behavior)
 * - Clear terminal: Uses the configured clear shortcut
 *
 * Returns a cleanup function to remove the handler.
 */
export function setupKeyboardHandler(
	xterm: XTerm,
	options: KeyboardHandlerOptions = {},
): () => void {
	const platform =
		typeof navigator !== "undefined" ? navigator.platform.toLowerCase() : "";
	const isMac = platform.includes("mac");
	const isWindows = platform.includes("win");

	// ghostty-web semantics: return true = "I handled it, don't process"
	//                        return false = "let ghostty process normally"
	// (This is inverted from xterm.js where true = "process", false = "don't process")
	const handler = (event: KeyboardEvent): boolean => {
		const isShiftEnter =
			event.key === "Enter" &&
			event.shiftKey &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.altKey;

		if (isShiftEnter) {
			if (event.type === "keydown" && options.onShiftEnter) {
				event.preventDefault();
				options.onShiftEnter();
			}
			return true;
		}

		const isCmdBackspace =
			event.key === "Backspace" &&
			event.metaKey &&
			!event.ctrlKey &&
			!event.altKey &&
			!event.shiftKey;

		if (isCmdBackspace) {
			if (event.type === "keydown" && options.onWrite) {
				event.preventDefault();
				options.onWrite("\x15\x1b[D"); // Ctrl+U + left arrow
			}
			return true;
		}

		// Cmd+Left: Move cursor to beginning of line (sends Ctrl+A)
		const isCmdLeft =
			event.key === "ArrowLeft" &&
			event.metaKey &&
			!event.ctrlKey &&
			!event.altKey &&
			!event.shiftKey;

		if (isCmdLeft) {
			if (event.type === "keydown" && options.onWrite) {
				event.preventDefault();
				options.onWrite("\x01"); // Ctrl+A - beginning of line
			}
			return true;
		}

		// Cmd+Right: Move cursor to end of line (sends Ctrl+E)
		const isCmdRight =
			event.key === "ArrowRight" &&
			event.metaKey &&
			!event.ctrlKey &&
			!event.altKey &&
			!event.shiftKey;

		if (isCmdRight) {
			if (event.type === "keydown" && options.onWrite) {
				event.preventDefault();
				options.onWrite("\x05"); // Ctrl+E - end of line
			}
			return true;
		}

		// Option+Left/Right (macOS): word navigation (Meta+B / Meta+F)
		const isOptionLeft =
			event.key === "ArrowLeft" &&
			event.altKey &&
			isMac &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.shiftKey;

		if (isOptionLeft) {
			if (event.type === "keydown" && options.onWrite) {
				options.onWrite("\x1bb"); // Meta+B - backward word
			}
			return true;
		}

		// Option+Right: Move cursor forward by word (Meta+F)
		const isOptionRight =
			event.key === "ArrowRight" &&
			event.altKey &&
			isMac &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.shiftKey;

		if (isOptionRight) {
			if (event.type === "keydown" && options.onWrite) {
				options.onWrite("\x1bf"); // Meta+F - forward word
			}
			return true;
		}

		// Ctrl+Left/Right (Windows): word navigation (Meta+B / Meta+F)
		const isCtrlLeft =
			event.key === "ArrowLeft" &&
			event.ctrlKey &&
			isWindows &&
			!event.metaKey &&
			!event.altKey &&
			!event.shiftKey;

		if (isCtrlLeft) {
			if (event.type === "keydown" && options.onWrite) {
				options.onWrite("\x1bb"); // Meta+B - backward word
			}
			return true;
		}

		const isCtrlRight =
			event.key === "ArrowRight" &&
			event.ctrlKey &&
			isWindows &&
			!event.metaKey &&
			!event.altKey &&
			!event.shiftKey;

		if (isCtrlRight) {
			if (event.type === "keydown" && options.onWrite) {
				options.onWrite("\x1bf"); // Meta+F - forward word
			}
			return true;
		}

		if (isTerminalReservedEvent(event)) return false;

		const clearKeys = getHotkeyKeys("CLEAR_TERMINAL");
		const isClearShortcut =
			clearKeys !== null && matchesHotkeyEvent(event, clearKeys);

		if (isClearShortcut) {
			if (event.type === "keydown" && options.onClear) {
				options.onClear();
			}
			return true;
		}

		if (event.type !== "keydown") return false;
		const potentialHotkey = hotkeyFromKeyboardEvent(
			event,
			getCurrentPlatform(),
		);
		if (!potentialHotkey) return false;

		if (isAppHotkeyEvent(event)) {
			// Return true to prevent ghostty from processing the key.
			// The original event bubbles to document where useAppHotkey handles it.
			return true;
		}

		return false;
	};

	xterm.attachCustomKeyEventHandler(handler);

	return () => {
		xterm.attachCustomKeyEventHandler(() => false);
	};
}

export function setupFocusListener(
	xterm: XTerm,
	onFocus: () => void,
): (() => void) | null {
	// ghostty-web's Terminal.focus() focuses the container element (contenteditable div),
	// not the textarea. Use focusin on the container which fires when the container or
	// any descendant (textarea) gains focus, and bubbles for reliable detection.
	const element = xterm.element;
	if (!element) return null;

	element.addEventListener("focusin", onFocus);

	return () => {
		element.removeEventListener("focusin", onFocus);
	};
}

export function setupResizeHandlers(
	container: HTMLDivElement,
	xterm: XTerm,
	fitAddon: FitAddon,
	onResize: (cols: number, rows: number) => void,
): () => void {
	const debouncedHandleResize = debounce(() => {
		const buffer = xterm.buffer.active;
		const wasAtBottom = buffer.viewportY >= buffer.baseY;
		fitAddon.fit();
		onResize(xterm.cols, xterm.rows);
		if (wasAtBottom) {
			requestAnimationFrame(() => scrollToBottom(xterm));
		}
	}, RESIZE_DEBOUNCE_MS);

	const resizeObserver = new ResizeObserver(debouncedHandleResize);
	resizeObserver.observe(container);
	window.addEventListener("resize", debouncedHandleResize);

	return () => {
		window.removeEventListener("resize", debouncedHandleResize);
		resizeObserver.disconnect();
		debouncedHandleResize.cancel();
	};
}

export interface ClickToMoveOptions {
	/** Callback to write data to the terminal PTY */
	onWrite: (data: string) => void;
}

/**
 * Convert mouse event coordinates to terminal cell coordinates.
 * Uses DOM measurement to calculate cell dimensions from the terminal font.
 * Returns null if coordinates cannot be determined.
 */
function getTerminalCoordsFromEvent(
	xterm: XTerm,
	event: MouseEvent,
): { col: number; row: number } | null {
	const element = xterm.element;
	if (!element) return null;

	const rect = element.getBoundingClientRect();
	const x = event.clientX - rect.left;
	const y = event.clientY - rect.top;

	// Measure cell dimensions from the terminal's font settings
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;

	const fontSize = xterm.options.fontSize ?? 14;
	const fontFamily = xterm.options.fontFamily ?? "monospace";
	ctx.font = `${fontSize}px ${fontFamily}`;
	const cellWidth = ctx.measureText("W").width;
	const cellHeight = fontSize * 1.2;

	if (cellWidth <= 0 || cellHeight <= 0) return null;

	// Clamp to valid terminal grid range to prevent excessive delta calculations
	const col = Math.max(0, Math.min(xterm.cols - 1, Math.floor(x / cellWidth)));
	const row = Math.max(0, Math.min(xterm.rows - 1, Math.floor(y / cellHeight)));

	return { col, row };
}

/**
 * Setup click-to-move cursor functionality.
 * Allows clicking on the current prompt line to move the cursor to that position.
 *
 * This works by calculating the difference between click position and cursor position,
 * then sending the appropriate number of arrow key sequences to move the cursor.
 *
 * Limitations:
 * - Only works on the current line (same row as cursor)
 * - Only works at the shell prompt (not in full-screen apps like vim)
 * - Requires the shell to interpret arrow key sequences
 *
 * Returns a cleanup function to remove the handler.
 */
export function setupClickToMoveCursor(
	xterm: XTerm,
	options: ClickToMoveOptions,
): () => void {
	const handleClick = (event: MouseEvent) => {
		// Don't interfere with full-screen apps (vim, less, etc. use alternate buffer)
		if (xterm.buffer.active !== xterm.buffer.normal) return;
		if (event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
			return;
		if (xterm.hasSelection()) return;

		const coords = getTerminalCoordsFromEvent(xterm, event);
		if (!coords) return;

		const buffer = xterm.buffer.active;
		const clickBufferRow = coords.row + buffer.viewportY;

		// Only move cursor on the same line (editable prompt area)
		if (clickBufferRow !== buffer.cursorY + buffer.viewportY) return;

		const delta = coords.col - buffer.cursorX;
		if (delta === 0) return;

		// Right arrow: \x1b[C, Left arrow: \x1b[D
		const arrowKey = delta > 0 ? "\x1b[C" : "\x1b[D";
		options.onWrite(arrowKey.repeat(Math.abs(delta)));
	};

	xterm.element?.addEventListener("click", handleClick);

	return () => {
		xterm.element?.removeEventListener("click", handleClick);
	};
}
