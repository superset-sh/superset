import type { Terminal } from "@xterm/xterm";

export function scrollToBottom(terminal: Terminal): void {
	terminal.scrollToBottom();
}
