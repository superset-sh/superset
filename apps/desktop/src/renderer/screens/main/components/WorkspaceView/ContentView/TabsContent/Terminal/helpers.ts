import { toast } from "@superset/ui/sonner";
import { CanvasAddon } from "@xterm/addon-canvas";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { ImageAddon } from "@xterm/addon-image";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import type { ITheme } from "@xterm/xterm";
import { Terminal as XTerm } from "@xterm/xterm";
import { debounce } from "lodash";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import { getHotkeyKeys, isAppHotkeyEvent } from "renderer/stores/hotkeys";
import { toXtermTheme } from "renderer/stores/theme/utils";
import { isTerminalReservedEvent, matchesHotkeyEvent } from "shared/hotkeys";
import {
	builtInThemes,
	DEFAULT_THEME_ID,
	getTerminalColors,
} from "shared/themes";
import { RESIZE_DEBOUNCE_MS, TERMINAL_OPTIONS } from "./config";
import { FilePathLinkProvider, UrlLinkProvider } from "./link-providers";
import { suppressQueryResponses } from "./suppressQueryResponses";
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

/**
 * Load GPU-accelerated renderer with automatic fallback.
 * Tries WebGL first, falls back to Canvas if WebGL fails.
 */
export type TerminalRenderer = {
	kind: "webgl" | "canvas" | "dom";
	dispose: () => void;
	clearTextureAtlas?: () => void;
};

type PreferredRenderer = TerminalRenderer["kind"] | "auto";

function getPreferredRenderer(): PreferredRenderer {
	try {
		const stored = localStorage.getItem("terminal-renderer");
		if (stored === "webgl" || stored === "canvas" || stored === "dom") {
			return stored;
		}
	} catch {
		// ignore
	}

	// Default: avoid xterm-webgl on macOS. We've seen repeated corruption/glitching
	// when terminals are hidden/shown or switched between panes.
	return navigator.userAgent.includes("Macintosh") ? "canvas" : "webgl";
}

function loadRenderer(xterm: XTerm): TerminalRenderer {
	let renderer: WebglAddon | CanvasAddon | null = null;
	let webglAddon: WebglAddon | null = null;
	let kind: TerminalRenderer["kind"] = "dom";

	const preferred = getPreferredRenderer();

	if (preferred === "dom") {
		return { kind: "dom", dispose: () => {}, clearTextureAtlas: undefined };
	}

	const tryLoadCanvas = () => {
		try {
			renderer = new CanvasAddon();
			xterm.loadAddon(renderer);
			kind = "canvas";
		} catch {
			// Canvas fallback failed, use default renderer
		}
	};

	if (preferred === "canvas") {
		tryLoadCanvas();
		return {
			kind,
			dispose: () => renderer?.dispose(),
			clearTextureAtlas: undefined,
		};
	}

	try {
		webglAddon = new WebglAddon();

		webglAddon.onContextLoss(() => {
			webglAddon?.dispose();
			webglAddon = null;
			try {
				renderer = new CanvasAddon();
				xterm.loadAddon(renderer);
				kind = "canvas";
				// Force refresh after context loss recovery
				xterm.refresh(0, xterm.rows - 1);
			} catch {
				// Canvas fallback failed, use default renderer
				renderer = null;
				kind = "dom";
			}
		});

		xterm.loadAddon(webglAddon);
		renderer = webglAddon;
		kind = "webgl";
	} catch {
		tryLoadCanvas();
	}

	return {
		kind,
		dispose: () => renderer?.dispose(),
		clearTextureAtlas: webglAddon
			? () => {
					try {
						webglAddon?.clearTextureAtlas();
					} catch (error) {
						console.warn("[Terminal] WebGL clearTextureAtlas() failed:", error);
					}
				}
			: undefined,
	};
}

export interface CreateTerminalOptions {
	cwd?: string;
	initialTheme?: ITheme | null;
	onFileLinkClick?: (path: string, line?: number, column?: number) => void;
}

/**
 * Mutable reference to the terminal renderer.
 * Used because the GPU renderer is loaded asynchronously after the terminal is created.
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
	const { cwd, initialTheme, onFileLinkClick } = options;

	// Use provided theme, or fall back to localStorage-based default to prevent flash
	const theme = initialTheme ?? getDefaultTerminalTheme();
	const terminalOptions = { ...TERMINAL_OPTIONS, theme };
	const xterm = new XTerm(terminalOptions);
	const fitAddon = new FitAddon();

	const clipboardAddon = new ClipboardAddon();
	const unicode11Addon = new Unicode11Addon();
	const imageAddon = new ImageAddon();

	// Track cleanup state to prevent operations on disposed terminal
	let isDisposed = false;
	let rafId: number | null = null;

	// Use a ref pattern so the renderer can be updated after rAF.
	// Start with a no-op DOM renderer - the actual GPU renderer is loaded async.
	const rendererRef: TerminalRendererRef = {
		current: {
			kind: "dom",
			dispose: () => {},
			clearTextureAtlas: undefined,
		},
	};

	xterm.open(container);

	// Load non-renderer addons synchronously - these are safe and needed immediately
	xterm.loadAddon(fitAddon);
	xterm.loadAddon(clipboardAddon);
	xterm.loadAddon(unicode11Addon);
	xterm.loadAddon(imageAddon);

	// Defer GPU renderer loading to next animation frame.
	// xterm.open() schedules a setTimeout for Viewport.syncScrollArea which expects
	// the renderer to be ready. Loading WebGL/Canvas immediately after open() can
	// cause a race condition where the setTimeout fires during addon initialization,
	// when _renderer is temporarily undefined (old renderer disposed, new not yet set).
	// Deferring to rAF ensures xterm's internal setTimeout completes first with the
	// default DOM renderer, then we safely swap to WebGL/Canvas.
	rafId = requestAnimationFrame(() => {
		rafId = null;
		if (isDisposed) return;
		rendererRef.current = loadRenderer(xterm);
	});

	import("@xterm/addon-ligatures")
		.then(({ LigaturesAddon }) => {
			if (isDisposed) return;
			try {
				xterm.loadAddon(new LigaturesAddon());
			} catch {
				// Ligatures not supported by current font
			}
		})
		.catch(() => {});

	const cleanupQuerySuppression = suppressQueryResponses(xterm);

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

	xterm.unicode.activeVersion = "11";
	fitAddon.fit();

	return {
		xterm,
		fitAddon,
		renderer: rendererRef,
		cleanup: () => {
			isDisposed = true;
			if (rafId !== null) {
				cancelAnimationFrame(rafId);
			}
			cleanupQuerySuppression();
			rendererRef.current.dispose();
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
	const textarea = xterm.textarea;
	if (!textarea) return () => {};

	let cancelActivePaste: (() => void) | null = null;

	const handlePaste = (event: ClipboardEvent) => {
		const text = event.clipboardData?.getData("text/plain");
		if (!text) return;

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
	const handler = (event: KeyboardEvent): boolean => {
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

		const isCmdBackspace =
			event.key === "Backspace" &&
			event.metaKey &&
			!event.ctrlKey &&
			!event.altKey &&
			!event.shiftKey;

		if (isCmdBackspace) {
			if (event.type === "keydown" && options.onWrite) {
				options.onWrite("\x15\x1b[D"); // Ctrl+U + left arrow
			}
			return false;
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
				options.onWrite("\x01"); // Ctrl+A - beginning of line
			}
			return false;
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
				options.onWrite("\x05"); // Ctrl+E - end of line
			}
			return false;
		}

		if (isTerminalReservedEvent(event)) return true;

		const clearKeys = getHotkeyKeys("CLEAR_TERMINAL");
		const isClearShortcut =
			clearKeys !== null && matchesHotkeyEvent(event, clearKeys);

		if (isClearShortcut) {
			if (event.type === "keydown" && options.onClear) {
				options.onClear();
			}
			return false;
		}

		if (event.type !== "keydown") return true;
		if (!event.metaKey && !event.ctrlKey) return true;

		if (isAppHotkeyEvent(event)) {
			// Return false to prevent xterm from processing the key.
			// The original event bubbles to document where useAppHotkey handles it.
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
	const element = xterm.element;
	if (!element) return null;

	const rect = element.getBoundingClientRect();
	const x = event.clientX - rect.left;
	const y = event.clientY - rect.top;

	// Note: xterm.js does not expose a public API for mouse-to-coords conversion,
	// so we must access internal _core._renderService.dimensions. This is fragile
	// and may break in future xterm.js versions.
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
