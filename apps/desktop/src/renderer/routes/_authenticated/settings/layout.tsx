import { createFileRoute, Outlet } from "@tanstack/react-router";
import { trpc } from "renderer/lib/trpc";
import { SettingsSidebar } from "./components/SettingsSidebar";

export const Route = createFileRoute("/_authenticated/settings")({
	component: SettingsLayout,
});

function SettingsLayout() {
	const { data: platform } = trpc.window.getPlatform.useQuery();
	const isMac = platform === undefined || platform === "darwin";

	return (
		<div className="flex flex-col h-screen w-screen bg-tertiary">
			{/* Top bar with Mac spacing - invisible but reserves space */}
			<div
				className="drag h-8 w-full bg-tertiary"
				style={{
					paddingLeft: isMac ? "88px" : "16px",
				}}
			/>

			{/* Main content */}
			<div className="flex flex-1 overflow-hidden">
				<SettingsSidebar />
				<div className="flex-1 m-3 bg-background rounded overflow-auto">
					<Outlet />
				</div>
			</div>
		</div>
	);
}
