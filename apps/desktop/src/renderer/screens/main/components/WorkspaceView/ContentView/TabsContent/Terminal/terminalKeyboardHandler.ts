import type { Terminal as XTerm } from "@xterm/xterm";
import { installTerminalKeyEventHandler } from "renderer/lib/terminal/terminal-key-event-handler";

/**
 * v1 uses the same xterm key handler as v2. Keep this wrapper so the older
 * terminal lifecycle does not know about the shared runtime module directly.
 */
export function setupKeyboardHandler(xterm: XTerm): () => void {
	return installTerminalKeyEventHandler(xterm);
}
