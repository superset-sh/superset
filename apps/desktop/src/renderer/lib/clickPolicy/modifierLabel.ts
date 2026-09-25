import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { LinkTier } from "./types";

const isMac =
	typeof navigator !== "undefined" &&
	navigator.platform.toLowerCase().includes("mac");

// The chords themselves never translate (glossary), but the verb around them
// does — so each label is one message with the glyph baked into the source.
const MAC_LABELS: Record<LinkTier, MessageDescriptor> = {
	plain: msg({ message: "click" }),
	shift: msg({ message: "⇧ click" }),
	meta: msg({ message: "⌘ click" }),
	metaShift: msg({
		message: "⌘⇧ click",
	}),
};

const NON_MAC_LABELS: Record<LinkTier, MessageDescriptor> = {
	plain: msg({ message: "click" }),
	shift: msg({
		message: "Shift+click",
	}),
	meta: msg({ message: "Ctrl+click" }),
	metaShift: msg({
		message: "Ctrl+Shift+click",
	}),
};

const LABELS = isMac ? MAC_LABELS : NON_MAC_LABELS;

export function modifierLabel(tier: LinkTier): string {
	return i18n._(LABELS[tier]);
}
