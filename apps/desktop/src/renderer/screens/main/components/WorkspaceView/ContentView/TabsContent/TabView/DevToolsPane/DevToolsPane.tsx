import type { MosaicBranch } from "react-mosaic-component";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { BasePaneWindow, PaneToolbarActions } from "../components";

interface DevToolsPaneProps {
	paneId: string;
	path: MosaicBranch[];
	isActive: boolean;
	tabId: string;
	targetPaneId: string;
	splitPaneAuto: (
		tabId: string,
		sourcePaneId: string,
		dimensions: { width: number; height: number },
		path?: MosaicBranch[],
	) => void;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
}

export function DevToolsPane({
	paneId,
	path,
	isActive,
	tabId,
	targetPaneId,
	splitPaneAuto,
	removePane,
	setFocusedPane,
}: DevToolsPaneProps) {
	// Query the CDP debug server for the DevTools frontend URL.
	// Retry every second until the URL is available (CDP target may not be ready immediately).
	const { data } = electronTrpc.browser.getDevToolsUrl.useQuery(
		{ browserPaneId: targetPaneId },
		{
			refetchOnWindowFocus: false,
			refetchInterval: (query) => (query.state.data?.url ? false : 1000),
		},
	);
	const devToolsUrl = data?.url;

	return (
		<BasePaneWindow
			paneId={paneId}
			path={path}
			tabId={tabId}
			isActive={isActive}
			splitPaneAuto={splitPaneAuto}
			removePane={removePane}
			setFocusedPane={setFocusedPane}
			renderToolbar={(handlers) => (
				<div className="flex h-full w-full items-center justify-between">
					<div className="flex h-full items-center px-2">
						<span className="text-xs text-muted-foreground">DevTools</span>
					</div>
					<PaneToolbarActions
						splitOrientation={handlers.splitOrientation}
						onSplitPane={handlers.onSplitPane}
						onClosePane={handlers.onClosePane}
						closeHotkeyId="CLOSE_TERMINAL"
					/>
				</div>
			)}
		>
			{devToolsUrl ? (
				<webview
					src={devToolsUrl}
					className="w-full h-full"
					style={{ display: "flex", flex: 1 }}
				/>
			) : (
				<div className="flex h-full w-full items-center justify-center text-muted-foreground text-xs">
					Connecting to DevTools...
				</div>
			)}
		</BasePaneWindow>
	);
}
