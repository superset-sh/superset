import { useEffect } from "react";
import { usePullRequestPaneIntent } from "renderer/stores/pull-request-pane-intent";

/**
 * Opens the pull-request pane a sidebar or list row asked for before
 * navigating here. Waits for the pane layout so the pane lands in the
 * restored tabs rather than a placeholder that gets replaced.
 */
export function usePullRequestPaneIntentOpener({
	workspaceId,
	isLayoutReady,
	openPullRequestPane,
}: {
	workspaceId: string;
	isLayoutReady: boolean;
	openPullRequestPane: (prNumber: number) => void;
}): void {
	const pendingIntent = usePullRequestPaneIntent((s) => s.intent);

	useEffect(() => {
		if (!isLayoutReady) return;
		if (pendingIntent?.workspaceId !== workspaceId) return;
		const intent = usePullRequestPaneIntent.getState().consume(workspaceId);
		if (!intent) return;
		openPullRequestPane(intent.prNumber);
	}, [pendingIntent, workspaceId, isLayoutReady, openPullRequestPane]);
}
