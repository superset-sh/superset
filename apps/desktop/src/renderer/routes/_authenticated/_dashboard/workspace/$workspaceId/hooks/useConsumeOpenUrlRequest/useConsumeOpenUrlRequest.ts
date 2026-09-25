import type { WorkspaceStore } from "@superset/panes";
import { useEffect, useRef } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { ConsumeSearch, PaneViewerData } from "../../types";
import {
	openUrlInWorkspace,
	type WorkspaceUrlOpenTarget,
} from "../../utils/openUrlInWorkspace";

interface UseConsumeOpenUrlRequestArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	url: string | undefined;
	target: WorkspaceUrlOpenTarget | undefined;
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
		openUrlInWorkspace({ store, target: resolvedTarget, url });
		consumeSearch(["openUrl", "openUrlTarget", "openUrlRequestId"]);
	}, [store, target, url, requestId, consumeSearch]);
}

export function getOpenUrlRequestConsumeKey({
	url,
	target,
	requestId,
}: {
	url: string;
	target: WorkspaceUrlOpenTarget;
	requestId: string | undefined;
}): string {
	return requestId
		? `${target}:${url}:request:${requestId}`
		: `${target}:${url}`;
}
