import { useMemo } from "react";
import { trpc } from "renderer/lib/trpc";
import { useActiveWindowIds, usePanes, useWindows } from "renderer/stores";
import { EmptyTabView } from "./EmptyTabView";
import { WindowView } from "./WindowView";

export function TabsContent() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;
	const allWindows = useWindows();
	const panes = usePanes();
	const activeWindowIds = useActiveWindowIds();

	const windowToRender = useMemo(() => {
		if (!activeWorkspaceId) return null;
		const activeWindowId = activeWindowIds[activeWorkspaceId];
		if (!activeWindowId) return null;

		return allWindows.find((win) => win.id === activeWindowId) || null;
	}, [activeWorkspaceId, activeWindowIds, allWindows]);

	if (!windowToRender) {
		return (
			<div className="flex-1 h-full">
				<EmptyTabView />
			</div>
		);
	}

	return (
		<div className="flex-1 h-full">
			<WindowView window={windowToRender} panes={panes} />
		</div>
	);
}
