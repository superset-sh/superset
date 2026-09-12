import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type {
	FolderLinkAction,
	FolderTierMap,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { tierFor } from "../tiers";
import type { ModifierEvent } from "../types";

export type { FolderLinkAction, FolderTierMap };

/**
 * Terminal folder links are settings-driven (Settings → Links → Folder
 * links): each click tier maps to reveal-in-sidebar, external editor,
 * Finder, or unbound. Defaults:
 *
 *   plain         → null   (caller decides — toggle/hint)
 *   shift         → open in Finder
 *   meta / ctrl   → reveal in sidebar
 *   meta+shift    → open in external editor
 */
export type FolderIntent = FolderLinkAction | null;

export function folderIntentForMap(
	event: ModifierEvent,
	map: FolderTierMap,
): FolderIntent {
	return map[tierFor(event, "4-tier")];
}

/**
 * Hardcoded rules for sidebar folder ROWS (file tree, changes list) — not
 * terminal links. "Reveal" is meaningless there (the row is already in the
 * sidebar), so only the external-editor tier acts:
 *
 *   plain / shift → null   (caller decides — toggle/hint)
 *   meta / ctrl   → reveal (callers treat as no-op)
 *   meta+shift    → open in external editor
 */
export function folderIntentFor(event: ModifierEvent): FolderIntent {
	const meta = event.metaKey || event.ctrlKey;
	if (!meta) return null;
	return event.shiftKey ? "external" : "reveal";
}

const FOLDER_INTENT_LABELS: Record<FolderLinkAction, MessageDescriptor> = {
	reveal: msg({
		message: "Reveal in sidebar",
	}),
	external: msg({
		message: "Open in editor",
	}),
	finder: msg({ message: "Open in Finder" }),
};

export function folderIntentLabel(intent: FolderIntent): string | null {
	if (intent === null) return null;
	return i18n._(FOLDER_INTENT_LABELS[intent]);
}
