import "react-mosaic-component/react-mosaic-component.css";
import "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/mosaic-theme.css";

import { useCallback, useMemo } from "react";
import {
	Mosaic,
	type MosaicBranch,
	type MosaicNode,
} from "react-mosaic-component";
import { dragDropManager } from "renderer/lib/dnd";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider";
import {
	type AgentScreen,
	agentScreenOperations,
} from "renderer/stores/agent-screens";
import { BrowserPane } from "./components/BrowserPane";
import { SummaryPane } from "./components/SummaryPane";
import { TerminalPane } from "./components/TerminalPane";

interface AgentScreenViewProps {
	screen: AgentScreen;
}

export function AgentScreenView({ screen }: AgentScreenViewProps) {
	const collections = useCollections();

	const paneIds = useMemo(() => Object.keys(screen.panes), [screen.panes]);

	const handleLayoutChange = useCallback(
		(newLayout: MosaicNode<string> | null) => {
			if (newLayout) {
				agentScreenOperations.setScreenLayout(
					collections.agentScreens,
					screen.id,
					newLayout,
				);
			}
		},
		[screen.id, collections.agentScreens],
	);

	const renderPane = useCallback(
		(paneId: string, _path: MosaicBranch[]) => {
			const pane = screen.panes[paneId];

			if (!pane) {
				return (
					<div className="w-full h-full flex items-center justify-center text-muted-foreground bg-background">
						Pane not found: {paneId}
					</div>
				);
			}

			switch (pane.type) {
				case "browser":
					return (
						<BrowserPane pane={pane} screenId={screen.id} paneId={paneId} />
					);
				case "terminal":
					return (
						<TerminalPane
							pane={pane}
							screenId={screen.id}
							paneId={paneId}
							workspaceId={screen.workspaceId}
						/>
					);
				case "summary":
					return (
						<SummaryPane pane={pane} screenId={screen.id} paneId={paneId} />
					);
				default:
					return (
						<div className="w-full h-full flex items-center justify-center text-muted-foreground bg-background">
							Unknown pane type
						</div>
					);
			}
		},
		[screen.panes, screen.id, screen.workspaceId],
	);

	// No panes or no layout
	if (paneIds.length === 0 || !screen.layout) {
		return (
			<div className="w-full h-full flex items-center justify-center bg-background">
				<div className="text-center">
					<h2 className="text-lg font-medium text-foreground mb-2">
						{screen.title}
					</h2>
					{screen.description && (
						<p className="text-sm text-muted-foreground mb-4">
							{screen.description}
						</p>
					)}
					<p className="text-sm text-muted-foreground">
						{screen.status === "composing"
							? "Agent is composing this screen..."
							: "No content to display"}
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="w-full h-full flex flex-col">
			{/* Header */}
			<div className="shrink-0 h-10 px-4 flex items-center justify-between border-b border-border bg-background">
				<div className="flex items-center gap-2">
					<h1 className="text-sm font-medium text-foreground">
						{screen.title}
					</h1>
					{screen.status === "composing" && (
						<span className="text-xs text-muted-foreground">
							(composing...)
						</span>
					)}
				</div>
				{screen.description && (
					<p className="text-xs text-muted-foreground truncate max-w-[300px]">
						{screen.description}
					</p>
				)}
			</div>

			{/* Mosaic layout */}
			<div className="flex-1 mosaic-container">
				<Mosaic<string>
					renderTile={renderPane}
					value={screen.layout}
					onChange={handleLayoutChange}
					className="mosaic-theme-dark"
					dragAndDropManager={dragDropManager}
				/>
			</div>
		</div>
	);
}
