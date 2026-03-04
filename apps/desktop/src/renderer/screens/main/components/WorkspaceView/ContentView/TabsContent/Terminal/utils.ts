import type { Terminal } from "@xterm/xterm";
import { quote } from "shell-quote";

export function shellEscapePaths(paths: string[]): string {
	return quote(paths);
}

export function scrollToBottom(terminal: Terminal): void {
	terminal.scrollToBottom();
}
