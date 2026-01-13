import { trpc } from "renderer/lib/trpc";
import { SupportMenu } from "./SupportMenu";
import { WindowControls } from "./WindowControls";

export function TopBar() {
	const { data: platform } = trpc.window.getPlatform.useQuery();
	// Default to Mac layout while loading to avoid overlap with traffic lights
	const isMac = platform === undefined || platform === "darwin";

	return (
		<div className="drag gap-2 h-12 w-full flex items-center justify-between bg-background border-b border-border">
			<div
				className="flex items-center gap-2 h-full"
				style={{
					paddingLeft: isMac ? "88px" : "16px",
				}}
			/>

			<div className="flex-1" />

			<div className="flex items-center gap-3 h-full pr-4 shrink-0">
				<SupportMenu />
				{!isMac && <WindowControls />}
			</div>
		</div>
	);
}
