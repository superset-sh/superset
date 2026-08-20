import type { Image } from "@expo/ui/swift-ui";
import type { ComponentProps } from "react";

export const FOREGROUND = "#e5e5e5";
export const MUTED = "#8e8e93";

/** Borrowed off the component rather than depending on sf-symbols-typescript
 *  directly — it reaches us only as an @expo/ui transitive dependency. */
type SFSymbolName = NonNullable<ComponentProps<typeof Image>["systemName"]>;

export interface TerminalQuickKey {
	id: string;
	/** Monospaced label; ignored when `symbol` is set. */
	label?: string;
	/** SF Symbol name (e.g. "arrow.up"). */
	symbol?: SFSymbolName;
	/** Raw bytes written into the PTY. Empty for keys that submit instead. */
	data: string;
	/** Sent through the host's Enter path rather than as raw bytes, so a TUI never mistakes it for a paste. */
	submits?: true;
}

// Escape/tab/arrow keys the soft keyboard doesn't have. The leading expander
// (`»`) reveals the wider set (ctrl, space, function keys) in a later pass.
export const QUICK_KEYS: TerminalQuickKey[] = [
	{ id: "esc", label: "esc", data: "\u001b" },
	{ id: "enter", symbol: "return", data: "", submits: true },
	{ id: "tab", label: "tab", data: "\t" },
	{ id: "shift-tab", label: "⇧tab", data: "\u001b[Z" },
	{ id: "up", symbol: "arrow.up", data: "\u001b[A" },
	{ id: "down", symbol: "arrow.down", data: "\u001b[B" },
	{ id: "left", symbol: "arrow.left", data: "\u001b[D" },
	{ id: "right", symbol: "arrow.right", data: "\u001b[C" },
	{ id: "ctrl-c", label: "^C", data: "\u0003" },
];
