import type {
	LinkAction,
	LinkTier,
	LinkTierMap,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";

export type { LinkAction, LinkTier, LinkTierMap };

export interface ModifierEvent {
	metaKey: boolean;
	ctrlKey: boolean;
	shiftKey: boolean;
}

/**
 * 4-tier surfaces (terminal, sidebar) read every tier independently.
 * 2-tier surfaces (chat, task markdown) collapse `shift→plain` and
 * `metaShift→meta` because the embedding context (rich text) needs
 * to keep shift-click free for cursor selection.
 */
export type TierMode = "4-tier" | "2-tier";

/**
 * Surface determines which action labels are surfaced in tooltips and
 * settings (e.g. "external" reads "Open in editor" for files but
 * "Open in browser" for URLs).
 */
export type Surface = "file" | "url";

export interface ResolvedClick {
	tier: LinkTier;
	action: LinkAction | null;
}
