import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";

interface BrowserOpenRequest {
	workspaceId: string;
	url: string;
	target: "current-tab" | "new-tab";
	requestId: string;
}

/**
 * Consumes external browser-open requests (CLI/agents via the browser
 * bridge). Navigating with the openUrl search params reuses the exact flow
 * the ports sidebar uses — the workspace route's useConsumeOpenUrlRequest
 * creates the pane, and its webview registration answers the bridge.
 */
export function useBrowserOpenRequests() {
	const navigate = useNavigate();

	useEffect(() => {
		const subscription = electronTrpcClient.browser.onOpenRequest.subscribe(
			undefined,
			{
				onData: (request: BrowserOpenRequest) => {
					navigateToV2Workspace(request.workspaceId, navigate, {
						search: {
							openUrl: request.url,
							openUrlTarget: request.target,
							openUrlRequestId: request.requestId,
						},
					}).catch((err) => {
						console.error("[useBrowserOpenRequests] navigate failed:", err);
					});
				},
			},
		);
		return () => {
			subscription.unsubscribe();
		};
	}, [navigate]);
}
