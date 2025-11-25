import { Settings } from "lucide-react";
import { trpc } from "renderer/lib/trpc";
import { WindowControls } from "../TopBar/WindowControls";

export function StartTopBar() {
	const { data: platform } = trpc.window.getPlatform.useQuery();
	const isMac = platform === "darwin";

	return (
		<div className="drag gap-2 h-12 w-full flex items-center justify-between border-b border-sidebar bg-background">
			<div
				className="flex items-center gap-4 h-full"
				style={{
					paddingLeft: isMac ? "80px" : "16px",
				}}
			>
				{/* Empty space on left for symmetry */}
			</div>
			<div className="flex items-center gap-2 flex-1 overflow-hidden h-full">
				{/* Empty middle section - no tabs */}
			</div>
			<div className="flex items-center gap-2 h-full pr-4 no-drag">
				{/* add later <button
					type="button"
					className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-accent transition-colors"
					aria-label="Settings"
				>
					<Settings className="w-4 h-4 text-muted-foreground" />
				</button> */}
				{!isMac && <WindowControls />}
			</div>
		</div>
	);
}
