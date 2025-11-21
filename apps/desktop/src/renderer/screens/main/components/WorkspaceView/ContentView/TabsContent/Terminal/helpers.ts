import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal as XTerm } from "@xterm/xterm";
import { debounce } from "lodash";
import { RESIZE_DEBOUNCE_MS, TERMINAL_OPTIONS } from "./config";

export function createTerminalInstance(container: HTMLDivElement): {
	xterm: XTerm;
	fitAddon: FitAddon;
} {
	const xterm = new XTerm(TERMINAL_OPTIONS);
	const fitAddon = new FitAddon();
	const webLinksAddon = new WebLinksAddon();

	xterm.loadAddon(fitAddon);
	xterm.loadAddon(webLinksAddon);
	xterm.open(container);
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
