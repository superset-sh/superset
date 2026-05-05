import type { LinkTier } from "./types";

const isMac =
	typeof navigator !== "undefined" &&
	navigator.platform.toLowerCase().includes("mac");

const MAC_LABELS: Record<LinkTier, string> = {
	plain: "click",
	shift: "⇧ click",
	meta: "⌘ click",
	metaShift: "⌘⇧ click",
};

const NON_MAC_LABELS: Record<LinkTier, string> = {
	plain: "click",
	shift: "Shift+click",
	meta: "Ctrl+click",
	metaShift: "Ctrl+Shift+click",
};

const LABELS = isMac ? MAC_LABELS : NON_MAC_LABELS;

export function modifierLabel(tier: LinkTier): string {
	return LABELS[tier];
}
