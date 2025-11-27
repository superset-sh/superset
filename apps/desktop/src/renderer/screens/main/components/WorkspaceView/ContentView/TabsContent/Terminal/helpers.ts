import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import type { ITheme } from "@xterm/xterm";
import { Terminal as XTerm } from "@xterm/xterm";
import { debounce } from "lodash";
import { trpcClient } from "renderer/lib/trpc-client";
import { RESIZE_DEBOUNCE_MS, TERMINAL_OPTIONS } from "./config";
import { FilePathLinkProvider } from "./FilePathLinkProvider";

// Default terminal themes that match the built-in themes (Dark and Light)
// These are used before the store hydrates to prevent flash
const DARK_DEFAULT_THEME: ITheme = {
	background: "#1a1a1a",
	foreground: "#d4d4d4",
	cursor: "#d4d4d4",
	cursorAccent: "#1a1a1a",
	selectionBackground: "#264f78",
	black: "#1e1e1e",
	red: "#f44747",
	green: "#6a9955",
	yellow: "#dcdcaa",
	blue: "#569cd6",
	magenta: "#c586c0",
	cyan: "#4ec9b0",
	white: "#d4d4d4",
	brightBlack: "#808080",
	brightRed: "#f44747",
	brightGreen: "#6a9955",
	brightYellow: "#dcdcaa",
	brightBlue: "#569cd6",
	brightMagenta: "#c586c0",
	brightCyan: "#4ec9b0",
	brightWhite: "#ffffff",
};

const LIGHT_DEFAULT_THEME: ITheme = {
	background: "#f5f5f5",
	foreground: "#1a1a1a",
	cursor: "#1a1a1a",
	cursorAccent: "#f5f5f5",
	selectionBackground: "#add6ff",
	black: "#1e1e1e",
	red: "#cd3131",
	green: "#14ce14",
	yellow: "#b5ba00",
	blue: "#0451a5",
	magenta: "#bc05bc",
	cyan: "#0598bc",
	white: "#555555",
	brightBlack: "#666666",
	brightRed: "#cd3131",
	brightGreen: "#14ce14",
	brightYellow: "#b5ba00",
	brightBlue: "#0451a5",
	brightMagenta: "#bc05bc",
	brightCyan: "#0598bc",
	brightWhite: "#1a1a1a",
};

/**
 * Get the default terminal theme based on stored theme type.
 * This reads from localStorage before store hydration to prevent flash.
 */
export function getDefaultTerminalTheme(): ITheme {
	try {
		const themeType = localStorage.getItem("theme-type");
		return themeType === "light" ? LIGHT_DEFAULT_THEME : DARK_DEFAULT_THEME;
	} catch {
		return DARK_DEFAULT_THEME;
	}
}

/**
 * Get the default terminal background based on stored theme type.
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
} {
	// Use provided theme, or fall back to localStorage-based default to prevent flash
	const theme = initialTheme ?? getDefaultTerminalTheme();
	const options = { ...TERMINAL_OPTIONS, theme };
	const xterm = new XTerm(options);
	const fitAddon = new FitAddon();

	const webLinksAddon = new WebLinksAddon((event, uri) => {
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

	return { xterm, fitAddon };
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
