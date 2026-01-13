import type { Terminal } from "@xterm/xterm";
import { quote } from "shell-quote";

export function shellEscapePaths(paths: string[]): string {
	return quote(paths);
}

export function smoothScrollToBottom(terminal: Terminal): void {
	const viewport = terminal.element?.querySelector(".xterm-viewport");
	if (viewport) {
		viewport.scrollTo({
			top: viewport.scrollHeight,
			behavior: "smooth",
		});
	} else {
		terminal.scrollToBottom();
	}
}

/** Get scroll position to save (undefined = at bottom, number = absolute line) */
export function getScrollPosition(terminal: Terminal): number | undefined {
	const { baseY, viewportY } = terminal.buffer.active;
	// Only save if scrolled up from bottom and not at line 0
	// (line 0 likely means content just loaded or race condition)
	if (viewportY === 0 || viewportY >= baseY) {
		return undefined;
	}
	return viewportY;
}

/** Restore scroll position (undefined = bottom, number = absolute line) */
export function restoreScrollPosition(
	terminal: Terminal,
	savedPosition: number | undefined,
): void {
	if (savedPosition !== undefined) {
		terminal.scrollToLine(savedPosition);
	} else {
		terminal.scrollToBottom();
	}
}
