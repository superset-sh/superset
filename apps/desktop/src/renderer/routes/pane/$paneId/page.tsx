import { createFileRoute } from "@tanstack/react-router";
import { Terminal } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal";
import { useTabsStore } from "renderer/stores/tabs/store";

export const Route = createFileRoute("/pane/$paneId/")({
	component: PaneWindowPage,
});

function PaneWindowPage() {
	const { paneId } = Route.useParams();

	const pane = useTabsStore((state) => state.panes[paneId]);
	const tab = useTabsStore((state) =>
		pane ? state.tabs.find((entry) => entry.id === pane.tabId) : undefined,
	);

	if (!pane || !tab) {
		return (
			<div className="flex h-full w-full items-center justify-center bg-background text-sm text-muted-foreground">
				This pane is no longer available.
			</div>
		);
	}

	if (pane.type !== "terminal") {
		return (
			<div className="flex h-full w-full items-center justify-center bg-background text-sm text-muted-foreground">
				Pane window mirroring is currently available for terminal panes only.
			</div>
		);
	}

	return (
		<div className="h-full w-full overflow-hidden bg-background">
			<Terminal paneId={pane.id} tabId={tab.id} workspaceId={tab.workspaceId} />
		</div>
	);
}
