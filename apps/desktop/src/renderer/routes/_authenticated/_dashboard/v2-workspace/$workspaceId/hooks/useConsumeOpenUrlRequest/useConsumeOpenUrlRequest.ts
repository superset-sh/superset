import type { WorkspaceStore } from "@superset/panes";
import { useEffect, useRef } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { ConsumeSearch, PaneViewerData } from "../../types";
import {
	openUrlInV2Workspace,
	type V2WorkspaceUrlOpenTarget,
} from "../../utils/openUrlInV2Workspace";

interface UseConsumeOpenUrlRequestArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	url: string | undefined;
	target: V2WorkspaceUrlOpenTarget | undefined;
	requestId: string | undefined;
	consumeSearch: ConsumeSearch;
}

export function useConsumeOpenUrlRequest({
	store,
	url,
	target,
	requestId,
	consumeSearch,
}: UseConsumeOpenUrlRequestArgs): void {
	const consumedRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		if (!url) return;
		const resolvedTarget = target ?? "current-tab";
		const key = getOpenUrlRequestConsumeKey({
			url,
			target: resolvedTarget,
			requestId,
		});
		if (consumedRef.current.has(key)) return;
		consumedRef.current.add(key);
		openUrlInV2Workspace({ store, target: resolvedTarget, url });
		consumeSearch(["openUrl", "openUrlTarget", "openUrlRequestId"]);
	}, [store, target, url, requestId, consumeSearch]);
}

export function getOpenUrlRequestConsumeKey({
	url,
	target,
	requestId,
}: {
	url: string;
	target: V2WorkspaceUrlOpenTarget;
	requestId: string | undefined;
}): string {
	return requestId
		? `${target}:${url}:request:${requestId}`
		: `${target}:${url}`;
}
