import { useEffect, useRef } from "react";
import { env } from "renderer/env.renderer";
import { useUserPreferences } from "renderer/hooks/useUserPreferences";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { ConsumeSearch, PagePaneData } from "../../types";

interface UseConsumePageOpenLinkArgs {
	isLayoutReady: boolean;
	pageId: string | undefined;
	pageSlug: string | undefined;
	focusRequestId: string | undefined;
	openPagePane: (page: PagePaneData) => void;
	consumeSearch: ConsumeSearch;
}

/**
 * Opens the page named by the workspace's search params, the way
 * `superset pages publish` deep-links into the workspace it just published
 * from. Each request id is consumed once so a re-render does not reopen the
 * pane, and the params are dropped once acted on so a relaunch does not.
 */
export function useConsumePageOpenLink({
	isLayoutReady,
	pageId,
	pageSlug,
	focusRequestId,
	openPagePane,
	consumeSearch,
}: UseConsumePageOpenLinkArgs): void {
	const { preferences } = useUserPreferences();
	const opensExternally = preferences.pageOpenAction === "external";
	const consumedRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		if (!isLayoutReady || !pageSlug) return;
		const key = `${pageId ?? ""}:${pageSlug}:${focusRequestId ?? ""}`;
		if (consumedRef.current.has(key)) return;
		consumedRef.current.add(key);

		if (opensExternally) {
			const url = `${env.NEXT_PUBLIC_WEB_URL.replace(/\/$/, "")}/page/${encodeURIComponent(pageSlug)}`;
			electronTrpcClient.external.openUrl.mutate(url).catch((error) => {
				console.error("[page-open-link] Failed to open URL:", error);
			});
		} else {
			openPagePane({ pageId, slug: pageSlug });
		}

		consumeSearch(["pageId", "pageSlug"]);
	}, [
		isLayoutReady,
		pageId,
		pageSlug,
		focusRequestId,
		opensExternally,
		openPagePane,
		consumeSearch,
	]);
}
