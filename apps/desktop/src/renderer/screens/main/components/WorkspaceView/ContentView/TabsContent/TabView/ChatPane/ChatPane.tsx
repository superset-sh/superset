import type { MosaicBranch } from "react-mosaic-component";
import { BasePaneWindow, PaneToolbarActions } from "../components";
import { ChatInterface } from "./ChatInterface";

interface ChatPaneProps {
	paneId: string;
	path: MosaicBranch[];
	isActive: boolean;
	tabId: string;
	workspaceId: string;
	splitPaneAuto: (
		tabId: string,
		sourcePaneId: string,
		dimensions: { width: number; height: number },
		path?: MosaicBranch[],
	) => void;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
}

export function ChatPane({
	paneId,
	path,
	isActive,
	tabId,
	workspaceId: _workspaceId,
	splitPaneAuto,
	removePane,
	setFocusedPane,
}: ChatPaneProps) {
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
				<div className="flex h-full w-full items-center justify-between px-3">
					<div className="flex min-w-0 items-center gap-2">
						<span className="text-xs font-medium text-muted-foreground">
							Chat
						</span>
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
			<ChatInterface />
		</BasePaneWindow>
	);
}
