import { useEffect } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { BasePaneWindow, PaneToolbarActions } from "../components";

interface DevToolsPaneProps {
	paneId: string;
	path: MosaicBranch[];
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
	tabId,
	targetPaneId,
	splitPaneAuto,
	removePane,
	setFocusedPane,
}: DevToolsPaneProps) {
	const { mutate: openDevTools } =
		electronTrpc.browser.openDevTools.useMutation();

	useEffect(() => {
		openDevTools({ paneId: targetPaneId });
	}, [openDevTools, targetPaneId]);

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
			<div className="flex h-full w-full flex-col items-center justify-center gap-3 text-muted-foreground text-xs">
				<div>DevTools open in a separate window.</div>
				<button
					type="button"
					onClick={() => openDevTools({ paneId: targetPaneId })}
					className="rounded border border-border px-3 py-1.5 text-foreground transition-colors hover:bg-accent"
				>
					Reopen DevTools
				</button>
			</div>
		</BasePaneWindow>
	);
}
