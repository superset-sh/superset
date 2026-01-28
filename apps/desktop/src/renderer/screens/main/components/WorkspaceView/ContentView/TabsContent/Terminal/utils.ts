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
