import type { ExternalApp } from "@superset/local-db";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@superset/ui/resizable";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useSidebarStore } from "renderer/stores/sidebar-state";
import { DEFAULT_TAB_PLACEMENT } from "shared/constants";
import { SidebarControl } from "../../SidebarControl";
import { ContentHeader } from "./ContentHeader";
import { PresetsBar } from "./components/PresetsBar";
import { TabsContent } from "./TabsContent";
import { GroupStrip } from "./TabsContent/GroupStrip";

interface ContentViewProps {
	defaultExternalApp?: ExternalApp | null;
	onOpenInApp: () => void;
	onOpenQuickOpen: () => void;
}

export function ContentView({
	defaultExternalApp,
	onOpenInApp,
	onOpenQuickOpen,
}: ContentViewProps) {
	const isSidebarOpen = useSidebarStore((s) => s.isSidebarOpen);
	const { data: showPresetsBar } =
		electronTrpc.settings.getShowPresetsBar.useQuery();
	const { data: tabPlacement, isLoading: isTabPlacementLoading } =
		electronTrpc.settings.getTabPlacement.useQuery();
	const isVertical = (tabPlacement ?? DEFAULT_TAB_PLACEMENT) === "vertical";

	if (isTabPlacementLoading) return null;

	if (isVertical) {
		return (
			<ResizablePanelGroup
				direction="horizontal"
				className="h-full overflow-hidden"
			>
				<ResizablePanel
					defaultSize={15}
					minSize={10}
					maxSize={30}
					className="flex flex-col border-r bg-background overflow-hidden"
				>
					{!isSidebarOpen && (
						<div className="flex items-center justify-end h-10 px-2 shrink-0 border-b">
							<SidebarControl />
						</div>
					)}
					<GroupStrip orientation="vertical" />
				</ResizablePanel>
				<ResizableHandle />
				<ResizablePanel defaultSize={85} className="overflow-hidden">
					<div className="h-full flex flex-col overflow-hidden">
						{showPresetsBar && <PresetsBar />}
						<TabsContent
							defaultExternalApp={defaultExternalApp}
							onOpenInApp={onOpenInApp}
							onOpenQuickOpen={onOpenQuickOpen}
						/>
					</div>
				</ResizablePanel>
			</ResizablePanelGroup>
		);
	}

	return (
		<div className="h-full flex flex-col overflow-hidden">
			<ContentHeader
				trailingAction={!isSidebarOpen ? <SidebarControl /> : undefined}
			>
				<GroupStrip />
			</ContentHeader>
			{showPresetsBar && <PresetsBar />}
			<TabsContent
				defaultExternalApp={defaultExternalApp}
				onOpenInApp={onOpenInApp}
				onOpenQuickOpen={onOpenQuickOpen}
			/>
		</div>
	);
}
