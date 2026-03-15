import type { MosaicBranch } from "react-mosaic-component";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { BasePaneWindow, PaneToolbarActions } from "../components";

interface DevToolsPaneProps {
	paneId: string;
	path: MosaicBranch[];
	tabId: string;
	targetPaneId: string;
	/** Whether this pane's tab is currently active/visible */
	isActive?: boolean;
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
	tabId,
	targetPaneId,
	isActive = true,
	splitPaneAuto,
	removePane,
	setFocusedPane,
}: DevToolsPaneProps) {
	// Query the CDP debug server for the DevTools frontend URL.
	// Poll every 1s until a URL is obtained (the browser webview may still be loading).
	// Pause polling when pane is inactive to reduce background work.
	const { data } = electronTrpc.browser.getDevToolsUrl.useQuery(
		{ browserPaneId: targetPaneId },
		{
			refetchOnWindowFocus: false,
			refetchInterval: (query) => {
				// Don't poll when inactive or when URL is already obtained
				if (!isActive || query.state.data?.url) return false;
				return 1000;
			},
		},
	);
	const devToolsUrl = data?.url;

	return (
		<BasePaneWindow
			paneId={paneId}
			path={path}
			tabId={tabId}
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
