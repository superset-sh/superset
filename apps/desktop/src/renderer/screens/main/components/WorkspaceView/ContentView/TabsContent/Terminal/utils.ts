import type { Terminal } from "ghostty-web";
import { quote } from "shell-quote";

export function shellEscapePaths(paths: string[]): string {
	return quote(paths);
}

export function scrollToBottom(terminal: Terminal): void {
	terminal.scrollToBottom();
}
