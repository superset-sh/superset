import { useCallback } from "react";
import type { LinkAction } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { inlineTierFor, type MouseEventLike, terminalTierFor } from "./tiers";
import { useV2UserPreferences } from "./useV2UserPreferences";

export interface LinkActionsApi {
	getFileAction: (event: MouseEventLike) => LinkAction | null;
	getUrlAction: (event: MouseEventLike) => LinkAction | null;
}

/** 3-tier dispatcher: plain / meta / metaShift. Use inside the terminal. */
export function useTerminalLinkActions(): LinkActionsApi {
	const { preferences } = useV2UserPreferences();
	const getFileAction = useCallback(
		(event: MouseEventLike) => preferences.fileLinks[terminalTierFor(event)],
		[preferences.fileLinks],
	);
	const getUrlAction = useCallback(
		(event: MouseEventLike) => preferences.urlLinks[terminalTierFor(event)],
		[preferences.urlLinks],
	);
	return { getFileAction, getUrlAction };
}

/** 2-tier dispatcher: plain / meta (shift collapses into meta). Use in chat, markdown. */
export function useInlineLinkActions(): LinkActionsApi {
	const { preferences } = useV2UserPreferences();
	const getFileAction = useCallback(
		(event: MouseEventLike) => preferences.fileLinks[inlineTierFor(event)],
		[preferences.fileLinks],
	);
	const getUrlAction = useCallback(
		(event: MouseEventLike) => preferences.urlLinks[inlineTierFor(event)],
		[preferences.urlLinks],
	);
	return { getFileAction, getUrlAction };
}
