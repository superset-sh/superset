import type { WorkspaceStore } from "@superset/panes";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect, useRef } from "react";
import { env } from "renderer/env.renderer";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";
import { openPagePaneInStore } from "../../utils/openPagePaneInStore";

interface UseConsumePageOpenLinkArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	isLayoutReady: boolean;
	pageId: string | undefined;
	pageSlug: string | undefined;
	focusRequestId: string | undefined;
}

export function useConsumePageOpenLink({
	store,
	isLayoutReady,
	pageId,
	pageSlug,
	focusRequestId,
}: UseConsumePageOpenLinkArgs): void {
	const isPagesEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.PAGES) ?? false;
	const { preferences } = useV2UserPreferences();
	const pageOpenAction = preferences.pageOpenAction;
	const consumedRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		if (!isPagesEnabled || !isLayoutReady || !pageSlug) return;
		const key = `${pageId ?? ""}:${pageSlug}:${focusRequestId ?? ""}`;
		if (consumedRef.current.has(key)) return;
		consumedRef.current.add(key);

		if (pageOpenAction === "external") {
			const url = `${env.NEXT_PUBLIC_WEB_URL.replace(/\/$/, "")}/page/${pageSlug}`;
			electronTrpcClient.external.openUrl.mutate(url).catch((error) => {
				console.error("[page-open-link] Failed to open URL:", error);
			});
			return;
		}

		openPagePaneInStore(
			store,
			{ pageId, slug: pageSlug },
			pageOpenAction === "newTab" ? "tab" : "split",
		);
	}, [
		store,
		isPagesEnabled,
		isLayoutReady,
		pageId,
		pageSlug,
		focusRequestId,
		pageOpenAction,
	]);
}
