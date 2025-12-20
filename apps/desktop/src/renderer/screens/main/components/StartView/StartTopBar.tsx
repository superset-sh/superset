import { trpc } from "renderer/lib/trpc";
import { SettingsButton } from "../SettingsButton";
import { WindowControls } from "../TopBar/WindowControls";

export function StartTopBar() {
	const { data: platform, isLoading } = trpc.window.getPlatform.useQuery();
	const isMac = !isLoading && platform === "darwin";
	const showWindowControls = !isLoading && !isMac;

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
				<SettingsButton />
				{showWindowControls && <WindowControls />}
			</div>
		</div>
	);
}
