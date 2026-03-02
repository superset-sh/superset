import { createFileRoute, Outlet } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";

export const Route = createFileRoute("/_authenticated/_onboarding")({
	component: OnboardingLayout,
});

function OnboardingLayout() {
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === undefined || platform === "darwin";

	return (
		<div className="flex flex-col h-full w-full bg-background">
			{/* Drag region for window dragging (macOS traffic lights / Windows title bar) */}
			<div
				className="drag h-12 w-full shrink-0"
				style={{
					paddingLeft: isMac ? "88px" : "16px",
				}}
			/>
			<Outlet />
		</div>
	);
}
