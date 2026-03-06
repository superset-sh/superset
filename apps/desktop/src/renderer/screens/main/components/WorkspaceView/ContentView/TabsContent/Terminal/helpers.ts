import { toast } from "@superset/ui/sonner";
import type { ITheme, Terminal as XTerm } from "@xterm/xterm";
import { FitAddon, Terminal as GhosttyTerminal } from "ghostty-web";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import { getHotkeyKeys, isAppHotkeyEvent } from "renderer/stores/hotkeys";
import { toXtermTheme } from "renderer/stores/theme/utils";
import { isTerminalReservedEvent, matchesHotkeyEvent } from "shared/hotkeys";
import {
	builtInThemes,
	DEFAULT_THEME_ID,
	getTerminalColors,
} from "shared/themes";
import { TERMINAL_OPTIONS } from "./config";
import { FilePathLinkProvider, UrlLinkProvider } from "./link-providers";
import { suppressQueryResponses } from "./suppressQueryResponses";
import { isTerminalAtBottom } from "./utils";

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
 * Renderer metadata (ghostty-web uses an internal canvas renderer).
 */
export type TerminalRenderer = {
	kind: "canvas";
	dispose: () => void;
	clearTextureAtlas?: () => void;
};

export interface CreateTerminalOptions {
	cwd?: string;
	initialTheme?: ITheme | null;
	onFileLinkClick?: (path: string, line?: number, column?: number) => void;
	onUrlClickRef?: { current: ((url: string) => void) | undefined };
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
	const {
		cwd,
		initialTheme,
		onFileLinkClick,
		onUrlClickRef: urlClickRef,
	} = options;

	// Use provided theme, or fall back to localStorage-based default to prevent flash
	const theme = initialTheme ?? getDefaultTerminalTheme();
	const terminalOptions = { ...TERMINAL_OPTIONS, theme };
	const xterm = new GhosttyTerminal(terminalOptions) as unknown as XTerm;
	const fitAddon = new FitAddon();

	const rendererRef: TerminalRendererRef = {
		current: {
			kind: "canvas",
			dispose: () => {},
			clearTextureAtlas: undefined,
		},
	};

	// StrictMode and rapid pane remounts can leave stale ghostty-web DOM behind
	// for a tick. Clear it before opening a new terminal to avoid double cursors.
	container.replaceChildren();
	xterm.open(container);
	xterm.loadAddon(fitAddon);

	const cleanupQuerySuppression = suppressQueryResponses(xterm);

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
		cleanup: () => {
			cleanupQuerySuppression();
			rendererRef.current.dispose();
		},
	};
}

function getGhosttyRuntime(xterm: XTerm): { blur?: () => void } {
	return xterm as XTerm & { blur?: () => void };
}

export function getTerminalTextarea(xterm: XTerm): HTMLTextAreaElement | null {
	const textarea = xterm.textarea;
	if (
		textarea &&
		typeof textarea.focus === "function" &&
		typeof textarea.blur === "function"
	) {
		return textarea as HTMLTextAreaElement;
	}
	return null;
}

export function focusTerminalInput(xterm: XTerm): void {
	xterm.focus();
	getTerminalTextarea(xterm)?.focus();
}

export function blurTerminalInput(xterm: XTerm): void {
	getGhosttyRuntime(xterm).blur?.();
	getTerminalTextarea(xterm)?.blur();
}

export interface KeyboardHandlerOptions {
	/** Callback for the configured clear terminal shortcut */
	onClear?: () => void;
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
 * Setup keyboard handling for terminal including:
 * - Shortcut forwarding: app hotkeys bubble to document where useAppHotkey listens
 * - Clear terminal: uses the configured clear shortcut
 *
 * Returns a cleanup function to remove the handler.
 */
export function setupKeyboardHandler(
	xterm: XTerm,
	options: KeyboardHandlerOptions = {},
): () => void {
	const handler = (event: KeyboardEvent): boolean => {
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

		if (isAppHotkeyEvent(event)) {
			// Return false to prevent terminal from processing the key.
			// The original event bubbles to document where useAppHotkey handles it.
			return false;
		}

		return true;
	};

	// ghostty-web uses inverse semantics from xterm:
	// return true => block default terminal input handling.
	xterm.attachCustomKeyEventHandler((event) => !handler(event));

	return () => {
		xterm.attachCustomKeyEventHandler(() => false);
	};
}

export function setupFocusListener(
	xterm: XTerm,
	onFocus: () => void,
): (() => void) | null {
	const element = xterm.element;
	const textarea = xterm.textarea;
	if (!element && !textarea) return null;

	element?.addEventListener("focus", onFocus);
	textarea?.addEventListener("focus", onFocus);

	return () => {
		element?.removeEventListener("focus", onFocus);
		textarea?.removeEventListener("focus", onFocus);
	};
}

export function setupResizeHandlers(
	container: HTMLDivElement,
	xterm: XTerm,
	onResize: (wasAtBottom: boolean) => void,
): () => void {
	const handleResize = () => {
		const wasAtBottom = isTerminalAtBottom(xterm);
		onResize(wasAtBottom);
	};

	const resizeObserver = new ResizeObserver(handleResize);
	resizeObserver.observe(container);
	window.addEventListener("resize", handleResize);

	return () => {
		window.removeEventListener("resize", handleResize);
		resizeObserver.disconnect();
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
	const canvas =
		xterm.element?.querySelector("canvas") ??
		(
			xterm as unknown as {
				renderer?: { getCanvas?: () => HTMLCanvasElement };
			}
		).renderer?.getCanvas?.() ??
		null;
	if (!canvas || typeof canvas.getBoundingClientRect !== "function")
		return null;

	const rect = canvas.getBoundingClientRect();
	const x = event.clientX - rect.left;
	const y = event.clientY - rect.top;

	const metrics = (
		xterm as unknown as {
			renderer?: { getMetrics: () => { width: number; height: number } };
		}
	).renderer?.getMetrics();
	if (!metrics) return null;

	const cellWidth = metrics.width;
	const cellHeight = metrics.height;

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
