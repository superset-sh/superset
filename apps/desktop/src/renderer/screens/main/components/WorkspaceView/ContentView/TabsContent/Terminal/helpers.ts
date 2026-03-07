import { toast } from "@superset/ui/sonner";
import { FitAddon, type ITheme, Terminal as XTerm } from "ghostty-web";
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
import { terminalDebugLog } from "./debug";
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
		: { background: "#151110", foreground: "#eae8e6" };
}

/**
 * Get the default terminal background based on stored theme.
 * This reads from localStorage before store hydration to prevent flash.
 */
export function getDefaultTerminalBg(): string {
	return getDefaultTerminalTheme().background ?? "#151110";
}

/**
 * Lightweight renderer handle used by the existing lifecycle code.
 *
 * Ghostty manages its own canvas renderer internally, so this is currently a
 * no-op placeholder rather than a real renderer addon wrapper.
 */
export type TerminalRenderer = {
	kind: "ghostty";
	dispose: () => void;
	clearTextureAtlas?: () => void;
};

export interface CreateTerminalOptions {
	cwd?: string;
	initialTheme?: ITheme | null;
	initialFontFamily?: string;
	initialFontSize?: number;
	onFileLinkClick?: (path: string, line?: number, column?: number) => void;
	onUrlClickRef?: { current: ((url: string) => void) | undefined };
}

/**
 * Mutable reference to the terminal renderer placeholder.
 */
export interface TerminalRendererRef {
	current: TerminalRenderer;
}

export function createTerminalInstance(
	container: HTMLDivElement,
	options: CreateTerminalOptions = {},
): {
	xterm: XTerm;
	fitAddon: FitAddon;
	renderer: TerminalRendererRef;
	cleanup: () => void;
} {
	const {
		cwd,
		initialTheme,
		initialFontFamily,
		initialFontSize,
		onFileLinkClick,
		onUrlClickRef: urlClickRef,
	} = options;

	container.replaceChildren();
	container.style.position = "relative";

	// Use provided theme, or fall back to localStorage-based default to prevent flash
	const theme = initialTheme ?? getDefaultTerminalTheme();
	const terminalOptions = {
		...TERMINAL_OPTIONS,
		theme,
		fontFamily: initialFontFamily ?? TERMINAL_OPTIONS.fontFamily,
		fontSize: initialFontSize ?? TERMINAL_OPTIONS.fontSize,
	};
	const xterm = new XTerm(terminalOptions);
	const fitAddon = new FitAddon();

	const rendererRef: TerminalRendererRef = {
		current: {
			kind: "ghostty",
			dispose: () => {},
			clearTextureAtlas: undefined,
		},
	};

	// ghostty-web hardcodes canvas getContext("2d", { alpha: true }) which forces
	// grayscale antialiasing. Temporarily patch to use alpha: false so the browser
	// can use subpixel (LCD) antialiasing for much sharper text on macOS/Retina.
	const origGetContext = HTMLCanvasElement.prototype.getContext;
	// biome-ignore lint/suspicious/noExplicitAny: patching native API
	(HTMLCanvasElement.prototype as any).getContext = function (
		type: string,
		// biome-ignore lint/suspicious/noExplicitAny: patching native API
		options?: any,
	) {
		if (type === "2d") {
			return origGetContext.call(this, type, { ...options, alpha: false });
		}
		return origGetContext.call(this, type, options);
	};
	try {
		xterm.open(container);
	} finally {
		HTMLCanvasElement.prototype.getContext = origGetContext;
	}
	if (xterm.element) {
		xterm.element.style.caretColor = "transparent";
		xterm.element.style.outline = "none";
	}
	xterm.loadAddon(fitAddon);

	const urlLinkProvider = new UrlLinkProvider(xterm, (_event, uri) => {
		const handler = urlClickRef?.current;
		if (handler) {
			handler(uri);
			return;
		}
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
		renderer: rendererRef,
		cleanup: () => rendererRef.current.dispose(),
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

		// On Linux/Wayland in Electron, clipboardData can be null for copy events.
		// Only cancel default behavior when we can write directly to event clipboardData.
		if (event.clipboardData) {
			event.preventDefault();
			event.clipboardData.setData("text/plain", trimmedText);
			return;
		}

		// Fallback path when clipboardData is unavailable.
		// Keep default browser copy behavior and best-effort write trimmed text.
		void navigator.clipboard?.writeText(trimmedText).catch(() => {});
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
	const textarea = xterm.textarea;
	if (!textarea) return () => {};

	let cancelActivePaste: (() => void) | null = null;

	const shouldForwardCtrlVForNonTextPaste = (
		event: ClipboardEvent,
		text: string,
	): boolean => {
		if (text) return false;
		const types = Array.from(event.clipboardData?.types ?? []);
		if (types.length === 0) return false;
		return types.some((type) => type !== "text/plain");
	};

	const handlePaste = (event: ClipboardEvent) => {
		const text = event.clipboardData?.getData("text/plain") ?? "";
		if (!text) {
			// Match terminal behavior like iTerm's "Paste or send ^V":
			// when clipboard has non-text payloads but no plain text, forward Ctrl+V.
			if (options.onWrite && shouldForwardCtrlVForNonTextPaste(event, text)) {
				event.preventDefault();
				event.stopImmediatePropagation();
				options.onWrite("\x16");
			}
			return;
		}

		event.preventDefault();
		event.stopImmediatePropagation();

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

	textarea.addEventListener("paste", handlePaste, { capture: true });

	return () => {
		cancelActivePaste?.();
		cancelActivePaste = null;
		textarea.removeEventListener("paste", handlePaste, { capture: true });
	};
}

/**
 * Setup keyboard handling for Ghostty including:
 * - Shortcut forwarding: app hotkeys are prevented from entering the PTY while
 *   still bubbling to document where useAppHotkey listens
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

		// Ghostty's handler returns true to consume the event, false to let Ghostty
		// handle and encode it. Terminal-reserved shortcuts must stay in Ghostty.
		if (isTerminalReservedEvent(event)) return false;

		const clearKeys = getHotkeyKeys("CLEAR_TERMINAL");
		const isClearShortcut =
			clearKeys !== null && matchesHotkeyEvent(event, clearKeys);

		if (isClearShortcut) {
			if (event.type === "keydown" && options.onClear) {
				event.preventDefault();
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
			// Prevent Ghostty from encoding app-level chords into terminal input.
			// The original keydown still bubbles to document where useAppHotkey runs.
			event.preventDefault();
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
	paneId?: string,
): (() => void) | null {
	const textarea = xterm.textarea;
	const element = xterm.element;
	if (!textarea && !element) return null;

	const handleTextareaFocus = () => {
		terminalDebugLog("dom", paneId, "focus-surface:textarea", {
			activeElement: document.activeElement?.tagName ?? null,
			caretColor: textarea?.style.caretColor ?? null,
		});
		onFocus();
	};
	const handleElementFocus = () => {
		terminalDebugLog("dom", paneId, "focus-surface:element", {
			activeElement: document.activeElement?.tagName ?? null,
			contentEditable: element?.getAttribute("contenteditable") ?? null,
			caretColor: element?.style.caretColor ?? null,
		});
		onFocus();
	};

	textarea?.addEventListener("focus", handleTextareaFocus);
	element?.addEventListener("focus", handleElementFocus);

	return () => {
		textarea?.removeEventListener("focus", handleTextareaFocus);
		element?.removeEventListener("focus", handleElementFocus);
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
 * Returns null if coordinates cannot be determined.
 */
function getTerminalCoordsFromEvent(
	xterm: XTerm,
	event: MouseEvent,
): { col: number; row: number } | null {
	const canvas = xterm.renderer?.getCanvas();
	const targetElement = canvas ?? xterm.element;
	if (!targetElement) return null;

	const rect = targetElement.getBoundingClientRect();
	const x = event.clientX - rect.left;
	const y = event.clientY - rect.top;

	const metrics = xterm.renderer?.getMetrics();
	const fallbackDimensions = (
		xterm as unknown as {
			_core?: {
				_renderService?: {
					dimensions?: { css: { cell: { width: number; height: number } } };
				};
			};
		}
	)._core?._renderService?.dimensions;

	const cellWidth = metrics?.width ?? fallbackDimensions?.css?.cell.width;
	const cellHeight = metrics?.height ?? fallbackDimensions?.css?.cell.height;

	if (!cellWidth || !cellHeight || cellWidth <= 0 || cellHeight <= 0) {
		return null;
	}

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
