import { useEffect } from "react";
import { trpc } from "renderer/lib/trpc";
import { WindowControls } from "./WindowControls";
export function TopBar() {
	const { data: platform } = trpc.window.getPlatform.useQuery();
	useEffect(() => {
		console.log("platform", platform);
	}, [platform]);

	console.log("platform", platform);
	const isMac = platform === "darwin";
	return (
		<div className="drag h-12 w-full flex items-center justify-between border-b border-border bg-background">
			{/* Left section - macOS needs extra padding for traffic lights */}
			<div
				className="no-drag flex items-center gap-4 h-full"
				style={{
					paddingLeft: isMac ? "80px" : "16px", // 80px accounts for traffic lights + spacing
				}}
			>
				<h1 className="text-sm font-semibold text-foreground">Superset</h1>
			</div>

			{/* Center section */}
			<div className="no-drag flex items-center gap-2">
				{/* Add navigation items or actions here */}
			</div>

			{/* Right section - Windows/Linux window controls */}
			<div className="no-drag flex items-center gap-2 h-full pr-4">
				{/* Add user menu or settings here */}

				{/* Windows/Linux custom window controls */}
				{!isMac && <WindowControls />}
			</div>
		</div>
	);
}
