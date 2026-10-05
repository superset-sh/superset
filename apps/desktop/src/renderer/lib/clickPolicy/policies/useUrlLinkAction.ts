import { useCallback } from "react";
import { env } from "renderer/env.renderer";
import { parseSupersetPageUrl } from "renderer/lib/parseSupersetPageUrl";
import type { LinkAction, ModifierEvent, TierMode } from "../types";
import { usePolicy } from "./policy";

export type UrlLinkAction = (
	event: ModifierEvent,
	url: string,
) => LinkAction | null;

export function useUrlLinkAction(mode: TierMode): UrlLinkAction {
	const { getAction: getUrlAction } = usePolicy("urlLinks", "url", mode);
	const { getAction: getPageAction } = usePolicy("pageLinks", "url", mode);
	return useCallback(
		(event, url) =>
			parseSupersetPageUrl(url, env.NEXT_PUBLIC_WEB_URL) === null
				? getUrlAction(event)
				: getPageAction(event),
		[getUrlAction, getPageAction],
	);
}
