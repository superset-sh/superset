import type { Terminal } from "@xterm/xterm";
import { INPUT_MODE_DISARM_SEQUENCE } from "shared/terminal-input-modes";
import { quote } from "shell-quote";

export function shellEscapePaths(paths: string[]): string {
	return quote(paths);
}

export function scrollToBottom(terminal: Terminal): void {
	terminal.scrollToBottom();
}

/**
 * Disarm the input-reporting modes a dead session can leave latched in a
 * reused xterm (a TUI killed mid-run never writes its restore sequences).
 * Written right before a fresh shell attaches so the new session starts from
 * default input behavior — clear() only wipes the buffer, not modes (#5508).
 */
export function disarmStaleInputModes(terminal: Terminal): void {
	terminal.write(INPUT_MODE_DISARM_SEQUENCE);
}
