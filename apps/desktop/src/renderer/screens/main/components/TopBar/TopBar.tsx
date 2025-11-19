import { trpc } from "renderer/lib/trpc";
import { WindowControls } from "./WindowControls";

export function TopBar() {
	const { data: platform } = trpc.window.getPlatform.useQuery();
	const isMac = platform === "darwin";
	return (
		<div className="drag h-12 w-full flex items-center justify-between border-b border-border bg-background">
			<div
				className="flex items-center gap-4 h-full"
				style={{
					paddingLeft: isMac ? "80px" : "16px",
				}}
			>
				<h1 className="text-sm font-semibold text-foreground">Superset</h1>
			</div>
			<div className=" flex items-center gap-2">Middle section</div>
			<div className="no-drag flex items-center gap-2 h-full pr-4">
				{!isMac && <WindowControls />}
			</div>
		</div>
	);
}
