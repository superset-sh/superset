import type { Terminal } from "@xterm/xterm";
import { quote } from "shell-quote";

export function shellEscapePaths(paths: string[]): string {
	return quote(paths);
}

export function scrollToBottom(terminal: Terminal): void {
	terminal.scrollToBottom();
}

export function isTerminalAtBottom(terminal: Terminal): boolean {
	const buffer = terminal.buffer.active;
	if (buffer.baseY > 0) {
		return buffer.viewportY >= buffer.baseY;
	}
	// ghostty-web uses viewportY as "lines above bottom".
	return buffer.viewportY <= 0;
}
