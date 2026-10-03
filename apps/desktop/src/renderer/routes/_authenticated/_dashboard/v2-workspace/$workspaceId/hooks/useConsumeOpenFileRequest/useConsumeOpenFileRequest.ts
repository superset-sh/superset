import type { WorkspaceStore } from "@superset/panes";
import { useEffect, useRef } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { StoreApi } from "zustand/vanilla";
import type { ConsumeSearch, OpenFile, PaneViewerData } from "../../types";
import type { V2WorkspaceUrlOpenTarget } from "../../utils/openUrlInV2Workspace";
import { openRequestedFilePanes } from "./utils/openRequestedFilePanes";

interface UseConsumeOpenFileRequestArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	isLayoutReady: boolean;
	paths: string[] | undefined;
	line: number | undefined;
	target: V2WorkspaceUrlOpenTarget | undefined;
	requestId: string | undefined;
	openFilePane: OpenFile;
	consumeSearch: ConsumeSearch;
}

/**
 * Opens the file panes named by the workspace's search params, the way
 * `superset files open` reaches a workspace it cannot touch the pane store
 * of: the global hook navigates here with the request, this opens the panes
 * once the persisted layout is in the store, and the pane ids go back to the
 * main process so the CLI gets its answer.
 */
export function useConsumeOpenFileRequest({
	store,
	isLayoutReady,
	paths,
	line,
	target,
	requestId,
	openFilePane,
	consumeSearch,
}: UseConsumeOpenFileRequestArgs): void {
	const consumedRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		if (!isLayoutReady || !paths || paths.length === 0) return;
		const resolvedTarget = target ?? "current-tab";
		const key = getOpenFileRequestConsumeKey({
			paths,
			line,
			target: resolvedTarget,
			requestId,
		});
		if (consumedRef.current.has(key)) return;
		consumedRef.current.add(key);
		const paneIds = openRequestedFilePanes(
			store,
			{ paths, line, target: resolvedTarget },
			openFilePane,
		);
		if (requestId) {
			electronTrpcClient.filePanes.resolveOpenRequest
				.mutate({ requestId, outcome: { ok: true, paneIds } })
				.catch((err) => {
					console.error(
						"[useConsumeOpenFileRequest] could not report pane ids:",
						err,
					);
				});
		}
		consumeSearch([
			"openFile",
			"openFileLine",
			"openFileTarget",
			"openFileRequestId",
		]);
	}, [
		store,
		isLayoutReady,
		paths,
		line,
		target,
		requestId,
		openFilePane,
		consumeSearch,
	]);
}

export function getOpenFileRequestConsumeKey({
	paths,
	line,
	target,
	requestId,
}: {
	paths: string[];
	line: number | undefined;
	target: V2WorkspaceUrlOpenTarget;
	requestId: string | undefined;
}): string {
	const base = `${target}:${line ?? ""}:${paths.join("\u0000")}`;
	return requestId ? `${base}:request:${requestId}` : base;
}
