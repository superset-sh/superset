import { toast } from "@superset/ui/sonner";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { ImageAddon } from "@xterm/addon-image";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
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
			cleanupQuerySuppression();
			linkManager.dispose();
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
