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
	/** A hairline between groups rather than a key. Writes nothing. */
	divider?: true;
}

// Escape/tab/arrow keys the soft keyboard doesn't have, in the order they have
// always been in — the dividers group them without moving any of them. Grouping
// only became legible once the keys shared one surface; nine separate backdrops
// left no room for hairlines between them. The expander (`»`) for ctrl, space
// and function keys is no longer blocked on width, only on choosing the set.
//
// Dividers are entries rather than styling: which keys belong together is the
// terminal's knowledge, not the composer's. They still need unique ids, because
// the strip identifies entries by id.
export const QUICK_KEYS: TerminalQuickKey[] = [
	{ id: "esc", label: "esc", data: "\u001b" },
	{ id: "enter", symbol: "return", data: "", submits: true },
	{ id: "tab", label: "tab", data: "\t" },
	{ id: "shift-tab", label: "⇧tab", data: "\u001b[Z" },
	{ id: "divider-keys", data: "", divider: true },
	{ id: "up", symbol: "arrow.up", data: "\u001b[A" },
	{ id: "down", symbol: "arrow.down", data: "\u001b[B" },
	{ id: "left", symbol: "arrow.left", data: "\u001b[D" },
	{ id: "right", symbol: "arrow.right", data: "\u001b[C" },
	{ id: "divider-arrows", data: "", divider: true },
	{ id: "ctrl-c", label: "^C", data: "\u0003" },
];
