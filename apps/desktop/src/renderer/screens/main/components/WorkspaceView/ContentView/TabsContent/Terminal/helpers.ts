import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal as XTerm } from "@xterm/xterm";
import { debounce } from "lodash";
import { trpcClient } from "renderer/lib/trpc-client";
import { RESIZE_DEBOUNCE_MS, TERMINAL_OPTIONS } from "./config";
import { FilePathLinkProvider } from "./FilePathLinkProvider";

export function createTerminalInstance(
	container: HTMLDivElement,
	cwd?: string,
): {
	xterm: XTerm;
	fitAddon: FitAddon;
} {
	const xterm = new XTerm(TERMINAL_OPTIONS);
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
