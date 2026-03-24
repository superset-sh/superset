import type { Terminal } from "@xterm/xterm";
import { quote } from "shell-quote";

export function shellEscapePaths(paths: string[]): string {
	return quote(paths);
}

export function scrollToBottom(terminal: Terminal): void {
	terminal.scrollToBottom();
}

export interface TerminalViewportSnapshot {
	line: number;
	wasAtBottom: boolean;
}

export function captureTerminalViewport(
	terminal: Terminal,
): TerminalViewportSnapshot {
	const { baseY, viewportY } = terminal.buffer.active;
	return {
		line: viewportY,
		wasAtBottom: viewportY >= baseY,
	};
}

export function restoreTerminalViewport(
	terminal: Terminal,
	snapshot: TerminalViewportSnapshot,
): void {
	if (snapshot.wasAtBottom) {
		scrollToBottom(terminal);
		return;
	}

	const targetLine = Math.max(
		0,
		Math.min(snapshot.line, terminal.buffer.active.baseY),
	);
	terminal.scrollToLine(targetLine);
}
