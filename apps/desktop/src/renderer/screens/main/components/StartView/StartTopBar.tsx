import { electronTrpc } from "renderer/lib/electron-trpc";
import { WindowControls } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/WindowControls";

export function StartTopBar() {
	const { data: platform, isLoading } =
		electronTrpc.window.getPlatform.useQuery();
	const isMac = !isLoading && platform === "darwin";
	const showWindowControls = !isLoading && !isMac;

	return (
		<div className="drag h-10 w-full flex items-center justify-end pr-2">
			{showWindowControls && (
				<div className="no-drag">
					<WindowControls />
				</div>
			)}
		</div>
	);
}
