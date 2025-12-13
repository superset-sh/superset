import { CanvasAddon } from "@xterm/addon-canvas";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { ImageAddon } from "@xterm/addon-image";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import type { ITheme } from "@xterm/xterm";
import { Terminal as XTerm } from "@xterm/xterm";
import { debounce } from "lodash";
import { trpcClient } from "renderer/lib/trpc-client";
import { toXtermTheme } from "renderer/stores/theme/utils";
import { isAppHotkey } from "shared/hotkeys";
import { builtInThemes, DEFAULT_THEME_ID } from "shared/themes";
import { RESIZE_DEBOUNCE_MS, TERMINAL_OPTIONS } from "./config";
import { FilePathLinkProvider } from "./FilePathLinkProvider";
import { suppressQueryResponses } from "./suppressQueryResponses";

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
			return toXtermTheme(theme.terminal);
		}
	} catch {
		// Fall through to default
	}
	// Final fallback to default theme
	const defaultTheme = builtInThemes.find((t) => t.id === DEFAULT_THEME_ID);
	return defaultTheme
		? toXtermTheme(defaultTheme.terminal)
		: { background: "#1a1a1a", foreground: "#d4d4d4" };
}

/**
 * Get the default terminal background based on stored theme.
 * This reads from localStorage before store hydration to prevent flash.
 */
export function getDefaultTerminalBg(): string {
	return getDefaultTerminalTheme().background ?? "#1a1a1a";
}

/**
 * Load GPU-accelerated renderer with automatic fallback.
 * Tries WebGL first, falls back to Canvas if WebGL fails.
 */
function loadRenderer(xterm: XTerm): { dispose: () => void } {
	let renderer: WebglAddon | CanvasAddon | null = null;

	try {
		const webglAddon = new WebglAddon();

		webglAddon.onContextLoss(() => {
			webglAddon.dispose();
			try {
				renderer = new CanvasAddon();
				xterm.loadAddon(renderer);
			} catch {
				// Canvas fallback failed, use default renderer
			}
		});

		xterm.loadAddon(webglAddon);
		renderer = webglAddon;
	} catch {
		try {
			renderer = new CanvasAddon();
			xterm.loadAddon(renderer);
		} catch {
			// Both renderers failed, use default
		}
	}

	return {
		dispose: () => renderer?.dispose(),
	};
}

export function createTerminalInstance(
	container: HTMLDivElement,
	cwd?: string,
	initialTheme?: ITheme | null,
): {
	xterm: XTerm;
	fitAddon: FitAddon;
	cleanup: () => void;
} {
	// Use provided theme, or fall back to localStorage-based default to prevent flash
	const theme = initialTheme ?? getDefaultTerminalTheme();
	const options = { ...TERMINAL_OPTIONS, theme };
	const xterm = new XTerm(options);
	const fitAddon = new FitAddon();

	const webLinksAddon = new WebLinksAddon((event, uri) => {
		// Only open URLs on CMD+click (Mac) or Ctrl+click (Windows/Linux)
		if (!event.metaKey && !event.ctrlKey) {
			return;
		}
		event.preventDefault();
		trpcClient.external.openUrl.mutate(uri).catch((error) => {
			console.error("[Terminal] Failed to open URL:", uri, error);
		});
	});

	const clipboardAddon = new ClipboardAddon();
	const unicode11Addon = new Unicode11Addon();
	const imageAddon = new ImageAddon();

	xterm.open(container);

	xterm.loadAddon(fitAddon);
	const renderer = loadRenderer(xterm);

	xterm.loadAddon(webLinksAddon);
	xterm.loadAddon(clipboardAddon);
	xterm.loadAddon(unicode11Addon);
	xterm.loadAddon(imageAddon);

	import("@xterm/addon-ligatures")
		.then(({ LigaturesAddon }) => {
			try {
				xterm.loadAddon(new LigaturesAddon());
			} catch {
				// Ligatures not supported by current font
			}
		})
		.catch(() => {});

	const cleanupQuerySuppression = suppressQueryResponses(xterm);

	const filePathLinkProvider = new FilePathLinkProvider(
		xterm,
		(_event, path, line, column) => {
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
		},
	);
	xterm.registerLinkProvider(filePathLinkProvider);

	xterm.unicode.activeVersion = "11";
	fitAddon.fit();

	return {
		xterm,
		fitAddon,
		cleanup: () => {
			cleanupQuerySuppression();
			renderer.dispose();
		},
	};
}

export interface KeyboardHandlerOptions {
	/** Callback for Shift+Enter to create a line continuation (like iTerm) */
	onShiftEnter?: () => void;
	/** Callback for Cmd+K to clear the terminal */
	onClear?: () => void;
	/** Callback to write data to the terminal PTY (for selection delete) */
	onWrite?: (data: string) => void;
}

export interface PasteHandlerOptions {
	/** Callback when text is pasted, receives the pasted text */
	onPaste?: (text: string) => void;
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

	const handlePaste = (event: ClipboardEvent) => {
		const text = event.clipboardData?.getData("text/plain");
		if (!text) return;

		event.preventDefault();
		event.stopImmediatePropagation();

		options.onPaste?.(text);
		xterm.paste(text);
	};

	textarea.addEventListener("paste", handlePaste, { capture: true });

	return () => {
		textarea.removeEventListener("paste", handlePaste, { capture: true });
	};
}

/**
 * Handle selection delete: when text is selected and user types a printable character,
 * delete the selection first (like a text area), then insert the character.
 *
 * Returns true if the event was handled, false otherwise.
 */
function handleSelectionDelete(
	xterm: XTerm,
	event: KeyboardEvent,
	onWrite?: (data: string) => void,
): boolean {
	if (!onWrite) return false;

	// Only handle keydown events
	if (event.type !== "keydown") return false;

	// Only handle single printable characters (no modifiers except shift for capitals)
	if (event.key.length !== 1) return false;
	if (event.ctrlKey || event.metaKey || event.altKey) return false;

	// Check if there's a selection
	const selection = xterm.getSelection();
	if (!selection || selection.length === 0) return false;

	const selectionPosition = xterm.getSelectionPosition();
	if (!selectionPosition) return false;

	const buffer = xterm.buffer.active;
	const cursorY = buffer.cursorY;
	const cursorX = buffer.cursorX;

	// Only handle selections on the current cursor line (prompt line)
	// Both start and end of selection must be on the same line as cursor
	const viewportCursorY = cursorY;
	if (
		selectionPosition.start.y !== viewportCursorY ||
		selectionPosition.end.y !== viewportCursorY
	) {
		return false;
	}

	const selStartX = selectionPosition.start.x;
	const selEndX = selectionPosition.end.x;
	const selectionLength = selEndX - selStartX;

	if (selectionLength <= 0) return false;

	// Prevent default handling - we'll handle this ourselves
	event.preventDefault();

	// Build the sequence of operations:
	// 1. Move cursor to selection start
	// 2. Delete the selection (using delete key)
	// 3. Type the new character

	let sequence = "";

	// Move cursor to selection start
	const moveToStart = selStartX - cursorX;
	if (moveToStart !== 0) {
		const arrowKey = moveToStart > 0 ? "\x1b[C" : "\x1b[D";
		sequence += arrowKey.repeat(Math.abs(moveToStart));
	}

	// Delete the selection using Delete key escape sequence (\x1b[3~)
	// This deletes characters forward from cursor position
	sequence += "\x1b[3~".repeat(selectionLength);

	// Type the new character
	sequence += event.key;

	// Clear the selection and send the sequence
	xterm.clearSelection();
	onWrite(sequence);

	return true;
}

/**
 * Setup keyboard handling for xterm including:
 * - Shortcut forwarding: App hotkeys are re-dispatched to document for react-hotkeys-hook
 * - Shift+Enter: Creates a line continuation (like iTerm) instead of executing
 * - Cmd+K: Clears the terminal
 * - Selection delete: When typing with selected text, delete selection first (like textarea)
 *
 * Returns a cleanup function to remove the handler.
 */
export function setupKeyboardHandler(
	xterm: XTerm,
	options: KeyboardHandlerOptions = {},
): () => void {
	const handler = (event: KeyboardEvent): boolean => {
		// Handle selection delete first (typing replaces selected text)
		if (handleSelectionDelete(xterm, event, options.onWrite)) {
			return false;
		}

		const isShiftEnter =
			event.key === "Enter" &&
			event.shiftKey &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.altKey;

		if (isShiftEnter) {
			if (event.type === "keydown" && options.onShiftEnter) {
				options.onShiftEnter();
			}
			return false;
		}

		const isClearShortcut =
			event.key.toLowerCase() === "k" &&
			event.metaKey &&
			!event.shiftKey &&
			!event.ctrlKey &&
			!event.altKey;

		if (isClearShortcut) {
			if (event.type === "keydown" && options.onClear) {
				options.onClear();
			}
			return false;
		}

		if (event.type !== "keydown") return true;
		if (!event.metaKey && !event.ctrlKey) return true;

		if (isAppHotkey(event)) {
			document.dispatchEvent(
				new KeyboardEvent(event.type, {
					key: event.key,
					code: event.code,
					keyCode: event.keyCode,
					which: event.which,
					ctrlKey: event.ctrlKey,
					shiftKey: event.shiftKey,
					altKey: event.altKey,
					metaKey: event.metaKey,
					repeat: event.repeat,
					bubbles: true,
					cancelable: true,
				}),
			);
			return false;
		}

		return true;
	};

	xterm.attachCustomKeyEventHandler(handler);

	return () => {
		xterm.attachCustomKeyEventHandler(() => true);
	};
}

export function setupFocusListener(
	xterm: XTerm,
	onFocus: () => void,
): (() => void) | null {
	const textarea = xterm.textarea;
	if (!textarea) return null;

	textarea.addEventListener("focus", onFocus);

	return () => {
		textarea.removeEventListener("focus", onFocus);
	};
}

export function setupResizeHandlers(
	container: HTMLDivElement,
	xterm: XTerm,
	fitAddon: FitAddon,
	onResize: (cols: number, rows: number) => void,
): () => void {
	const debouncedHandleResize = debounce(() => {
		fitAddon.fit();
		onResize(xterm.cols, xterm.rows);
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
	const element = xterm.element;
	if (!element) return null;

	const rect = element.getBoundingClientRect();
	const x = event.clientX - rect.left;
	const y = event.clientY - rect.top;

	// Get cell dimensions from xterm's internal dimensions
	const dimensions = (
		xterm as unknown as {
			_core?: {
				_renderService?: {
					dimensions?: { css: { cell: { width: number; height: number } } };
				};
			};
		}
	)._core?._renderService?.dimensions;
	if (!dimensions?.css?.cell) return null;

	const cellWidth = dimensions.css.cell.width;
	const cellHeight = dimensions.css.cell.height;

	if (cellWidth <= 0 || cellHeight <= 0) return null;

	const col = Math.floor(x / cellWidth);
	const row = Math.floor(y / cellHeight);

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
		// Only handle left click
		if (event.button !== 0) return;

		// Don't interfere with modifier clicks (links, etc.)
		if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
			return;

		// Don't move cursor if there's a selection (user is selecting text)
		if (xterm.hasSelection()) return;

		const coords = getTerminalCoordsFromEvent(xterm, event);
		if (!coords) return;

		const buffer = xterm.buffer.active;
		const cursorX = buffer.cursorX;
		const cursorY = buffer.cursorY;

		// Convert viewport row to buffer row for comparison
		const clickBufferRow = coords.row + buffer.viewportY;

		// Only move cursor on the same line as the current cursor
		// This ensures we only move within the editable prompt area
		if (clickBufferRow !== cursorY + buffer.viewportY) return;

		// Calculate horizontal movement needed
		const delta = coords.col - cursorX;
		if (delta === 0) return;

		// Generate arrow key escape sequences
		// Right arrow: \x1b[C, Left arrow: \x1b[D
		const arrowKey = delta > 0 ? "\x1b[C" : "\x1b[D";
		const moves = arrowKey.repeat(Math.abs(delta));

		options.onWrite(moves);
	};

	xterm.element?.addEventListener("click", handleClick);

	return () => {
		xterm.element?.removeEventListener("click", handleClick);
	};
}
