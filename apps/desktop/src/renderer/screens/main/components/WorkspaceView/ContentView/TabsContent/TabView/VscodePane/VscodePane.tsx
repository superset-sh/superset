import { useCallback } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { BasePaneWindow, PaneTitle, PaneToolbarActions } from "../components";
import { VscodeBetaDisabled } from "./components/VscodeBetaDisabled";
import { VscodeMissingCli } from "./components/VscodeMissingCli";
import { useEmbeddedVscode } from "./hooks/useEmbeddedVscode";

interface VscodePaneProps {
	paneId: string;
	path: MosaicBranch[];
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

export function VscodePane({
	paneId,
	path,
	tabId,
	workspaceId,
	splitPaneAuto,
	removePane,
	setFocusedPane,
}: VscodePaneProps) {
	const pane = useTabsStore((s) => s.panes[paneId]);
	const paneName = pane?.name;
	const setPaneName = useTabsStore((s) => s.setPaneName);

	const { data: vscodeBetaEnabled } =
		electronTrpc.settings.getVscodeBetaEnabled.useQuery();
	const betaOff = vscodeBetaEnabled === false;

	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId },
		{ enabled: !!workspaceId },
	);
	const worktreePath =
		pane?.vscode?.worktreePath ?? workspace?.worktreePath ?? "";

	const { containerRef, phase, errorMessage } = useEmbeddedVscode({
		paneId,
		tabId,
		worktreePath,
		enabled: !betaOff,
	});

	const handleRename = useCallback(
		(next: string) => setPaneName(paneId, next),
		[paneId, setPaneName],
	);

	return (
		<BasePaneWindow
			paneId={paneId}
			path={path}
			tabId={tabId}
			splitPaneAuto={splitPaneAuto}
			removePane={removePane}
			setFocusedPane={setFocusedPane}
			renderToolbar={(handlers) => (
				<div className="flex h-full w-full items-center justify-between px-3">
					<PaneTitle
						name={paneName ?? ""}
						fallback="VS Code"
						onRename={handleRename}
					/>
					<PaneToolbarActions
						splitOrientation={handlers.splitOrientation}
						onSplitPane={handlers.onSplitPane}
						onClosePane={handlers.onClosePane}
						closeHotkeyId="CLOSE_TERMINAL"
					/>
				</div>
			)}
		>
			<div className="relative flex-1 h-full w-full">
				{betaOff ? (
					<VscodeBetaDisabled />
				) : phase === "cli-missing" ? (
					<VscodeMissingCli />
				) : (
					<>
						<div
							ref={containerRef}
							className="h-full w-full"
							style={{ background: "transparent", pointerEvents: "none" }}
						/>
						{phase !== "ready" && (
							<div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
								{phase === "failed"
									? (errorMessage ?? "Failed to start VS Code")
									: "Starting VS Code\u2026"}
							</div>
						)}
					</>
				)}
			</div>
		</BasePaneWindow>
	);
}
