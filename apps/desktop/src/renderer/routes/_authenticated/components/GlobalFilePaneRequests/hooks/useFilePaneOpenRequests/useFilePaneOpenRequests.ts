import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";

interface FilePaneOpenRequest {
	requestId: string;
	workspaceId: string;
	paths: string[];
	line?: number;
	target: "current-tab" | "new-tab";
}

/**
 * File-open requests from `superset files open`. A file pane only exists
 * inside its workspace view, so every request becomes a navigation there
 * (a no-op route change when it is already on screen) carrying the request
 * as search params, which the workspace page consumes once on arrival.
 */
export function useFilePaneOpenRequests() {
	const navigate = useNavigate();

	useEffect(() => {
		const subscription = electronTrpcClient.filePanes.onOpenRequest.subscribe(
			undefined,
			{
				onData: (request: FilePaneOpenRequest) => {
					navigateToV2Workspace(request.workspaceId, navigate, {
						search: {
							openFile: request.paths,
							openFileLine: request.line,
							openFileTarget: request.target,
							openFileRequestId: request.requestId,
						},
					}).catch((err: unknown) => {
						console.error("[useFilePaneOpenRequests] navigate failed:", err);
						electronTrpcClient.filePanes.resolveOpenRequest
							.mutate({
								requestId: request.requestId,
								outcome: {
									ok: false,
									error: `Could not open workspace ${request.workspaceId}: ${
										err instanceof Error ? err.message : String(err)
									}`,
								},
							})
							.catch((reportErr: unknown) => {
								console.error(
									`[useFilePaneOpenRequests] could not report failure for ${request.requestId}:`,
									reportErr,
								);
							});
					});
				},
			},
		);
		return () => {
			subscription.unsubscribe();
		};
	}, [navigate]);
}
