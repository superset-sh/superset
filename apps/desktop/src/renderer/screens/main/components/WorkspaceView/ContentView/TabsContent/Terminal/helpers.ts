import { toast } from "@superset/ui/sonner";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { ImageAddon } from "@xterm/addon-image";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import type { ITheme } from "@xterm/xterm";
import { Terminal as XTerm } from "@xterm/xterm";
import type { DetectedLink } from "renderer/lib/terminal/links";
import { TerminalLinkManager } from "renderer/lib/terminal/terminal-link-manager";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import { toXtermTheme } from "renderer/stores/theme/utils";
import {
	builtInThemes,
	DEFAULT_THEME_ID,
	getTerminalColors,
} from "shared/themes";
import { TERMINAL_OPTIONS } from "./config";
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

// Once WebGL fails, skip it for all subsequent terminals (VS Code pattern).
let suggestedRendererType: "webgl" | "dom" | undefined;

export interface CreateTerminalOptions {
	/**
	 * Workspace id used for worktree lookup during path stat/resolution.
	 * The main process looks up the worktree root, so relative paths always
	 * anchor to the correct worktree regardless of renderer load state.
	 */
	workspaceId?: string;
	initialTheme?: ITheme | null;
	onFileLinkClick?: (event: MouseEvent, link: DetectedLink) => void;
	onUrlClickRef?: { current: ((url: string) => void) | undefined };
}

/**
 * Create an xterm instance opened into a detached wrapper div (not a live container).
 * The wrapper can be moved between DOM containers via appendChild without
 * disposing the terminal — this is the "hide attach" pattern from v2.
 *
 * Used by v1-terminal-cache.ts to keep xterm alive across React mount/unmount.
 */
export function createTerminalInWrapper(options: CreateTerminalOptions = {}): {
	xterm: XTerm;
	fitAddon: FitAddon;
	searchAddon: SearchAddon;
	wrapper: HTMLDivElement;
	linkManager: TerminalLinkManager;
	cleanup: () => void;
} {
	const {
		workspaceId,
		initialTheme,
		onFileLinkClick,
		onUrlClickRef: urlClickRef,
	} = options;

	const theme = initialTheme ?? getDefaultTerminalTheme();
	const terminalOptions = { ...TERMINAL_OPTIONS, theme };
	const xterm = new XTerm(terminalOptions);
	const fitAddon = new FitAddon();
	const searchAddon = new SearchAddon();

	const clipboardAddon = new ClipboardAddon();
	const unicode11Addon = new Unicode11Addon();
	const imageAddon = new ImageAddon();

	let disposed = false;
	let webglAddon: WebglAddon | null = null;

	// Open into a detached wrapper div — not the live container.
	const wrapper = document.createElement("div");
	wrapper.style.width = "100%";
	wrapper.style.height = "100%";
	xterm.open(wrapper);

	xterm.loadAddon(fitAddon);
	xterm.loadAddon(searchAddon);
	xterm.loadAddon(clipboardAddon);
	xterm.loadAddon(unicode11Addon);
	xterm.loadAddon(imageAddon);

	try {
		xterm.loadAddon(new LigaturesAddon());
	} catch {
		// Ligatures not supported by current font
	}

	// Defer WebGL to rAF to avoid racing xterm's post-open viewport sync.
	const rafId = requestAnimationFrame(() => {
		if (disposed || suggestedRendererType === "dom") return;

		try {
			webglAddon = new WebglAddon();
			webglAddon.onContextLoss(() => {
				webglAddon?.dispose();
				webglAddon = null;
				xterm.refresh(0, xterm.rows - 1);
			});
			xterm.loadAddon(webglAddon);
		} catch {
			suggestedRendererType = "dom";
			webglAddon = null;
		}
	});

	const cleanupQuerySuppression = suppressQueryResponses(xterm);

	const linkManager = new TerminalLinkManager(xterm);
	linkManager.setHandlers({
		stat: async (path) => {
			try {
				return await trpcClient.external.statPath.mutate({ path, workspaceId });
			} catch {
				return null;
			}
		},
		onFileLinkClick: (event, link) => {
			if (!event.metaKey && !event.ctrlKey) {
				return;
			}
			if (onFileLinkClick) {
				onFileLinkClick(event, link);
				return;
			}
			trpcClient.external.openFileInEditor
				.mutate({
					path: link.resolvedPath,
					line: link.row,
					column: link.col,
				})
				.catch((error) => {
					console.error(
						"[Terminal] Failed to open file in editor:",
						link.resolvedPath,
						error,
					);
				});
		},
		onUrlClick: (event, uri) => {
			if (!event.metaKey && !event.ctrlKey) return;
			event.preventDefault();
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
		},
	});

	xterm.unicode.activeVersion = "11";

	return {
		xterm,
		fitAddon,
		searchAddon,
		wrapper,
		linkManager,
		cleanup: () => {
			disposed = true;
			cancelAnimationFrame(rafId);
			cleanupQuerySuppression();
			linkManager.dispose();
			try {
				webglAddon?.dispose();
			} catch {}
			webglAddon = null;
		},
	};
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

export {
	type ClickToMoveOptions,
	setupClickToMoveCursor,
} from "renderer/lib/terminal/terminal-click-to-move";
