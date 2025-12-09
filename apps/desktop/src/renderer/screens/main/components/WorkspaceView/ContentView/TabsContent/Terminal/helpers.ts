import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
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

	// Unicode 11 provides better emoji and unicode rendering than default
	const unicode11Addon = new Unicode11Addon();

	xterm.open(container);

	// Addons must be loaded after terminal is opened, otherwise they won't attach properly
	xterm.loadAddon(fitAddon);
	xterm.loadAddon(webLinksAddon);
	xterm.loadAddon(clipboardAddon);
	xterm.loadAddon(unicode11Addon);

	// Suppress terminal query responses (DA1, DA2, CPR, OSC color responses, etc.)
	// These are protocol-level responses that should be handled internally, not displayed
	const cleanupQuerySuppression = suppressQueryResponses(xterm);

	// Register file path link provider (Cmd+Click to open in Cursor/VSCode)
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

	// Activate Unicode 11
	xterm.unicode.activeVersion = "11";

	// Fit after addons are loaded
	fitAddon.fit();

	return {
		xterm,
		fitAddon,
		cleanup: cleanupQuerySuppression,
	};
}

export interface KeyboardHandlerOptions {
	/** Callback for Shift+Enter to create a line continuation (like iTerm) */
	onShiftEnter?: () => void;
	/** Callback for Cmd+K to clear the terminal */
	onClear?: () => void;
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
		// Get text from clipboard event data
		const text = event.clipboardData?.getData("text/plain");
		if (!text) return;

		// Stop xterm's internal paste handler from also processing this
		event.preventDefault();
		event.stopImmediatePropagation();

		// Notify caller of pasted text (for command buffer tracking)
		options.onPaste?.(text);

		// xterm.paste() handles:
		// 1. Line ending normalization (CRLF/LF -> CR)
		// 2. Bracketed paste mode wrapping (\x1b[200~ ... \x1b[201~)
		xterm.paste(text);
	};

	// Use capture phase to intercept before xterm's handler
	textarea.addEventListener("paste", handlePaste, { capture: true });

	return () => {
		textarea.removeEventListener("paste", handlePaste, { capture: true });
	};
}

/**
 * Setup keyboard handling for xterm including:
 * - Shortcut forwarding: App hotkeys are re-dispatched to document for react-hotkeys-hook
 * - Shift+Enter: Creates a line continuation (like iTerm) instead of executing
 * - Cmd+K: Clears the terminal
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
			// Block both keydown and keyup to prevent Enter from leaking through
			if (event.type === "keydown" && options.onShiftEnter) {
				options.onShiftEnter();
			}
			return false;
		}

		// Handle Cmd+K to clear terminal (handle directly since it needs xterm access)
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
			// Re-dispatch to document for react-hotkeys-hook to catch
			// Must explicitly copy modifier properties since they're prototype getters, not own properties
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

	// Return cleanup function that removes the handler by setting a no-op
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
	const debouncedResize = debounce((cols: number, rows: number) => {
		onResize(cols, rows);
	}, RESIZE_DEBOUNCE_MS);

	const handleResize = () => {
		fitAddon.fit();
		debouncedResize(xterm.cols, xterm.rows);
	};

	const resizeObserver = new ResizeObserver(handleResize);
	resizeObserver.observe(container);
	window.addEventListener("resize", handleResize);

	return () => {
		window.removeEventListener("resize", handleResize);
		resizeObserver.disconnect();
		debouncedResize.cancel();
	};
}
