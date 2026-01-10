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
