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

	// Forward app hotkeys to document so useHotkeys can catch them
	setupShortcutForwarding(xterm);

	// Fit after addons are loaded
	fitAddon.fit();

	return {
		xterm,
		fitAddon,
		cleanup: cleanupQuerySuppression,
	};
}

/**
 * Setup shortcut forwarding for xterm.
 * When an app hotkey is pressed while terminal is focused, re-dispatch to document
 * so react-hotkeys-hook handlers can catch it.
 */
function setupShortcutForwarding(xterm: XTerm): void {
	xterm.attachCustomKeyEventHandler((event: KeyboardEvent) => {
		// Only intercept keydown events with meta/ctrl modifier
		if (event.type !== "keydown") return true;
		if (!event.metaKey && !event.ctrlKey) return true;

		// Check if this is an app hotkey
		if (isAppHotkey(event)) {
			// Re-dispatch to document for react-hotkeys-hook to catch
			document.dispatchEvent(new KeyboardEvent(event.type, event));
			// Return false to tell xterm to ignore this event
			return false;
		}

		// Let xterm handle all other keys
		return true;
	});
}

export function setupFocusListener(
	xterm: XTerm,
	workspaceId: string,
	tabId: string,
	setActiveTab: (workspaceId: string, tabId: string) => void,
): (() => void) | null {
	const textarea = xterm.textarea;
	if (!textarea) return null;

	const handleFocus = () => {
		setActiveTab(workspaceId, tabId);
	};

	textarea.addEventListener("focus", handleFocus);

	return () => {
		textarea.removeEventListener("focus", handleFocus);
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
