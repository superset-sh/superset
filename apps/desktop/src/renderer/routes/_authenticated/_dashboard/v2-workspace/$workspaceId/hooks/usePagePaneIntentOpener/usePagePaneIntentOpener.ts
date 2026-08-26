import { useEffect } from "react";
import { useLastActiveV2Workspace } from "renderer/stores/last-active-v2-workspace";
import { usePagePaneIntent } from "renderer/stores/page-pane-intent";
import type { PagePaneData } from "../../types";

export function usePagePaneIntentOpener({
	workspaceId,
	isLayoutReady,
	openPagePane,
}: {
	workspaceId: string;
	isLayoutReady: boolean;
	openPagePane: (page: PagePaneData) => void;
}): void {
	const setLastActive = useLastActiveV2Workspace((s) => s.setWorkspaceId);
	const pendingIntent = usePagePaneIntent((s) => s.intent);

	useEffect(() => {
		setLastActive(workspaceId);
	}, [workspaceId, setLastActive]);

	useEffect(() => {
		if (!isLayoutReady) return;
		if (pendingIntent?.workspaceId !== workspaceId) return;
		const intent = usePagePaneIntent.getState().consume(workspaceId);
		if (!intent) return;
		openPagePane({
			slug: intent.slug,
			pageId: intent.pageId,
			title: intent.title,
		});
	}, [pendingIntent, workspaceId, isLayoutReady, openPagePane]);
}
