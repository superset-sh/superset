import type { ExternalApp } from "@superset/local-db";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useSidebarStore } from "renderer/stores/sidebar-state";
import { SidebarControl } from "../../SidebarControl";
import { PresetsBar } from "./components/PresetsBar";
import { useShowPresetsBar } from "./hooks/useShowPresetsBar";
import { TabsContent } from "./TabsContent";

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
	const { showPresetsBar, toggleShowPresetsBar } = useShowPresetsBar();

	electronTrpc.menu.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type === "toggle-presets-bar") {
				toggleShowPresetsBar();
			}
		},
	});

	return (
		<div className="relative h-full flex flex-col overflow-hidden">
			{showPresetsBar && <PresetsBar />}
			<TabsContent
				defaultExternalApp={defaultExternalApp}
				onOpenInApp={onOpenInApp}
				onOpenQuickOpen={onOpenQuickOpen}
			/>
			{!isSidebarOpen && (
				<div className="absolute right-1 top-0 z-30 flex h-10 items-center bg-background pl-1">
					<SidebarControl />
				</div>
			)}
		</div>
	);
}
