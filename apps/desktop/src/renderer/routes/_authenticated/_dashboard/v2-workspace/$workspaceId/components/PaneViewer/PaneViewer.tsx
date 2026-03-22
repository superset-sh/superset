import { PaneLayout, workbenchReducer } from "@superset/pane-layout";
import {
	Bug,
	FileCode2,
	Globe,
	MessageSquare,
	TerminalSquare,
} from "lucide-react";
import { useReducer } from "react";
import {
	type PaneConfig,
	createStubPaneViewerState,
} from "./pane-viewer.model";

interface PaneViewerProps {
	workspaceBranch: string;
	workspaceId: string;
	workspaceName: string;
}

function getPaneIcon(kind: PaneConfig["kind"]) {
	switch (kind) {
		case "file":
			return FileCode2;
		case "terminal":
			return TerminalSquare;
		case "browser":
			return Globe;
		case "chat":
			return MessageSquare;
		case "devtools":
			return Bug;
	}
}

function renderPaneContent(pane: PaneConfig | null) {
	if (!pane) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Missing pane config
			</div>
		);
	}

	switch (pane.kind) {
		case "file":
			return (
				<div className="flex h-full flex-col gap-4 p-4">
					<div className="flex items-center gap-2 text-sm font-medium">
						<FileCode2 className="size-4" />
						File
					</div>
					<dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm">
						<dt className="text-muted-foreground">Path</dt>
						<dd className="break-all">{pane.filePath}</dd>
						<dt className="text-muted-foreground">Mode</dt>
						<dd>{pane.mode}</dd>
						<dt className="text-muted-foreground">Language</dt>
						<dd>{pane.language ?? "unknown"}</dd>
						<dt className="text-muted-foreground">Git state</dt>
						<dd>{pane.hasChanges ? "modified" : "clean"}</dd>
					</dl>
				</div>
			);
		case "terminal":
			return (
				<div className="flex h-full flex-col gap-4 p-4">
					<div className="flex items-center gap-2 text-sm font-medium">
						<TerminalSquare className="size-4" />
						Terminal
					</div>
					<dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm">
						<dt className="text-muted-foreground">Session key</dt>
						<dd>{pane.sessionKey}</dd>
						<dt className="text-muted-foreground">CWD</dt>
						<dd className="break-all">{pane.cwd}</dd>
						<dt className="text-muted-foreground">Launch mode</dt>
						<dd>{pane.launchMode}</dd>
						<dt className="text-muted-foreground">Persistent</dt>
						<dd>{pane.isPersistent ? "yes" : "no"}</dd>
					</dl>
				</div>
			);
		case "browser":
			return (
				<div className="flex h-full flex-col gap-4 p-4">
					<div className="flex items-center gap-2 text-sm font-medium">
						<Globe className="size-4" />
						Browser
					</div>
					<dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm">
						<dt className="text-muted-foreground">URL</dt>
						<dd className="break-all">{pane.url}</dd>
						<dt className="text-muted-foreground">Mode</dt>
						<dd>{pane.mode}</dd>
					</dl>
				</div>
			);
		case "chat":
			return (
				<div className="flex h-full flex-col gap-4 p-4">
					<div className="flex items-center gap-2 text-sm font-medium">
						<MessageSquare className="size-4" />
						Chat
					</div>
					<dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm">
						<dt className="text-muted-foreground">Session</dt>
						<dd>{pane.sessionId ?? "unbound"}</dd>
						<dt className="text-muted-foreground">Model</dt>
						<dd>{pane.model ?? "unset"}</dd>
						<dt className="text-muted-foreground">Draft</dt>
						<dd>{pane.hasDraft ? "present" : "empty"}</dd>
					</dl>
				</div>
			);
		case "devtools":
			return (
				<div className="flex h-full flex-col gap-4 p-4">
					<div className="flex items-center gap-2 text-sm font-medium">
						<Bug className="size-4" />
						Devtools
					</div>
					<dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm">
						<dt className="text-muted-foreground">Target pane</dt>
						<dd>{pane.targetPaneId}</dd>
						<dt className="text-muted-foreground">Target title</dt>
						<dd>{pane.targetTitle}</dd>
					</dl>
				</div>
			);
	}
}

export function PaneViewer({
	workspaceBranch,
	workspaceId,
	workspaceName,
}: PaneViewerProps) {
	const [state, dispatch] = useReducer(
		workbenchReducer<PaneConfig>,
		undefined,
		() =>
			createStubPaneViewerState({
				workspaceBranch,
				workspaceName,
			}),
	);
	const activeWindow =
		(state.activeWindowId && state.windows[state.activeWindowId]) || null;

	return (
		<div
			className="relative flex flex-1 min-h-0 min-w-0 w-full overflow-hidden bg-background"
			data-workspace-id={workspaceId}
		>
			{activeWindow ? (
				<PaneLayout
					className="w-full"
					onActivateGroup={({ groupId, windowId }) =>
						dispatch({ type: "setActiveGroup", groupId, windowId })
					}
					onClosePane={({ groupId, pane, windowId }) =>
						dispatch({
							type: "closePane",
							groupId,
							paneId: pane.id,
							windowId,
						})
					}
					onDragEnterGroup={({ groupId, windowId }) =>
						dispatch({
							type: "hoverDragTarget",
							groupId,
							windowId,
						})
					}
					onDragEnterWindow={({ windowId }) =>
						dispatch({
							type: "hoverDragTarget",
							groupId: activeWindow.activeGroupId,
							windowId,
						})
					}
					onDragStartPane={({ groupId, pane, windowId, event }) => {
						event.dataTransfer.effectAllowed = "move";
						event.dataTransfer.setData("text/plain", pane.id);
						dispatch({
							type: "beginDrag",
							paneId: pane.id,
							sourceGroupId: groupId,
							sourceWindowId: windowId,
						});
					}}
					onSelectPane={({ groupId, pane, windowId }) =>
						dispatch({
							type: "setActivePane",
							groupId,
							paneId: pane.id,
							windowId,
						})
					}
					renderPane={(pane) => renderPaneContent(pane.data)}
					window={activeWindow}
				/>
			) : null}
		</div>
	);
}
