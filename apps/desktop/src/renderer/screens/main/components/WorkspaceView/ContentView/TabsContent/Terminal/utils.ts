import type { Terminal } from "@xterm/xterm";
import { quote } from "shell-quote";

export function shellEscapePaths(paths: string[]): string {
	return quote(paths);
}

export function scrollToBottom(
	terminal: Terminal,
	behavior: ScrollBehavior = "instant",
): void {
	const viewport = terminal.element?.querySelector(".xterm-viewport");
	if (viewport) {
		viewport.scrollTo({
			top: viewport.scrollHeight,
			behavior,
		});
	} else {
		terminal.scrollToBottom();
	}
}

/** Get scroll offset from bottom (0 = at bottom, >0 = scrolled up N lines) */
export function getScrollOffsetFromBottom(terminal: Terminal): number {
	const { baseY, viewportY } = terminal.buffer.active;
	return baseY - viewportY;
}

/** Restore scroll position from offset (0 = bottom, >0 = N lines from bottom) */
export function restoreScrollPosition(
	terminal: Terminal,
	offsetFromBottom: number | undefined,
): void {
	if (offsetFromBottom && offsetFromBottom > 0) {
		const targetLine = terminal.buffer.active.baseY - offsetFromBottom;
		terminal.scrollToLine(Math.max(0, targetLine));
	} else {
		terminal.scrollToBottom();
	}
}
