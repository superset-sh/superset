import { trpc } from "renderer/lib/trpc";
import { SidebarControl } from "./SidebarControl";
import { Tabs } from "./Tabs";
import { WindowControls } from "./WindowControls";

export function TopBar() {
	const { data: platform } = trpc.window.getPlatform.useQuery();
	const isMac = platform === "darwin";
	return (
		<div className="drag gap-2 h-12 w-full flex items-center justify-between border-b border-border bg-background">
			<div
				className="flex items-center gap-4 h-full"
				style={{
					paddingLeft: isMac ? "80px" : "16px",
				}}
			>
				<SidebarControl />
			</div>
			<div className="no-drag flex items-center gap-2 flex-1 overflow-hidden h-full">
				<Tabs />
			</div>
			<div className="no-drag flex items-center gap-2 h-full pr-4">
				{!isMac && <WindowControls />}
			</div>
		</div>
	);
}
