import { Button } from "@superset/ui/button";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import {
	PaneWorkspace,
	createPaneRoot,
	createPaneWorkspaceStore,
	type PaneDefinition,
	type PaneRegistry,
	usePaneWorkspaceStore,
} from "@superset/pane-layout";
import {
	Bug,
	FileCode2,
	Globe,
	MessageSquare,
	Pin,
	SquareSplitHorizontal,
	SquareSplitVertical,
	TerminalSquare,
} from "lucide-react";
import { useRef, useState } from "react";
import {
	createBrowserPane,
	createChatPane,
	createDevtoolsPane,
	createFilePane,
	createPaneViewerState,
	createTerminalPane,
	type BrowserPaneData,
	type ChatPaneData,
	type DevtoolsPaneData,
	type FilePaneData,
	type PaneViewerData,
	type TerminalPaneData,
} from "./pane-viewer.model";

interface PaneViewerProps {
	workspaceBranch: string;
	workspaceId: string;
	workspaceName: string;
}

const paneRegistry: PaneRegistry<PaneViewerData> = {
	file: {
		getIcon: () => <FileCode2 className="size-4" />,
		renderPane: ({ pane }) => {
			const data = pane.data as FilePaneData;

			return (
				<div className="flex min-h-0 flex-1 flex-col gap-4 bg-background p-4">
					<div className="flex items-center gap-2 text-sm font-medium">
						<FileCode2 className="size-4" />
						File
					</div>
					<dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm">
						<dt className="text-muted-foreground">Path</dt>
						<dd className="break-all">{data.filePath}</dd>
						<dt className="text-muted-foreground">Mode</dt>
						<dd>{data.mode}</dd>
						<dt className="text-muted-foreground">Language</dt>
						<dd>{data.language ?? "unknown"}</dd>
						<dt className="text-muted-foreground">Git state</dt>
						<dd>{data.hasChanges ? "modified" : "clean"}</dd>
						<dt className="text-muted-foreground">Pinned</dt>
						<dd>{pane.pinned ? "yes" : "preview"}</dd>
					</dl>
				</div>
			);
		},
	},
	terminal: {
		getIcon: () => <TerminalSquare className="size-4" />,
		renderPane: ({ pane }) => {
			const data = pane.data as TerminalPaneData;

			return (
				<div className="flex min-h-0 flex-1 flex-col gap-4 bg-background p-4">
					<div className="flex items-center gap-2 text-sm font-medium">
						<TerminalSquare className="size-4" />
						Terminal
					</div>
					<dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm">
						<dt className="text-muted-foreground">Session key</dt>
						<dd>{data.sessionKey}</dd>
						<dt className="text-muted-foreground">CWD</dt>
						<dd className="break-all">{data.cwd}</dd>
						<dt className="text-muted-foreground">Launch mode</dt>
						<dd>{data.launchMode}</dd>
						<dt className="text-muted-foreground">Persistent</dt>
						<dd>{data.isPersistent ? "yes" : "no"}</dd>
					</dl>
				</div>
			);
		},
	},
	browser: {
		getIcon: () => <Globe className="size-4" />,
		renderPane: ({ pane }) => {
			const data = pane.data as BrowserPaneData;

			return (
				<div className="flex min-h-0 flex-1 flex-col gap-4 bg-background p-4">
					<div className="flex items-center gap-2 text-sm font-medium">
						<Globe className="size-4" />
						Browser
					</div>
					<dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm">
						<dt className="text-muted-foreground">URL</dt>
						<dd className="break-all">{data.url}</dd>
						<dt className="text-muted-foreground">Mode</dt>
						<dd>{data.mode}</dd>
					</dl>
				</div>
			);
		},
	},
	chat: {
		getIcon: () => <MessageSquare className="size-4" />,
		renderPane: ({ pane }) => {
			const data = pane.data as ChatPaneData;

			return (
				<div className="flex min-h-0 flex-1 flex-col gap-4 bg-background p-4">
					<div className="flex items-center gap-2 text-sm font-medium">
						<MessageSquare className="size-4" />
						Chat
					</div>
					<dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm">
						<dt className="text-muted-foreground">Session</dt>
						<dd>{data.sessionId ?? "unbound"}</dd>
						<dt className="text-muted-foreground">Model</dt>
						<dd>{data.model ?? "unset"}</dd>
						<dt className="text-muted-foreground">Draft</dt>
						<dd>{data.hasDraft ? "present" : "empty"}</dd>
					</dl>
				</div>
			);
		},
	},
	devtools: {
		getIcon: () => <Bug className="size-4" />,
		renderPane: ({ pane }) => {
			const data = pane.data as DevtoolsPaneData;

			return (
				<div className="flex min-h-0 flex-1 flex-col gap-4 bg-background p-4">
					<div className="flex items-center gap-2 text-sm font-medium">
						<Bug className="size-4" />
						Devtools
					</div>
					<dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm">
						<dt className="text-muted-foreground">Target pane</dt>
						<dd>{data.targetPaneId}</dd>
						<dt className="text-muted-foreground">Target title</dt>
						<dd>{data.targetTitle}</dd>
					</dl>
				</div>
			);
		},
	},
};

function PaneViewerToolbar({
	store,
	workspaceBranch,
	workspaceName,
}: {
	store: ReturnType<typeof createPaneWorkspaceStore<PaneViewerData>>;
	workspaceBranch: string;
	workspaceName: string;
}) {
	const roots = usePaneWorkspaceStore(store, (state) => state.state.roots);
	const activeRootId = usePaneWorkspaceStore(
		store,
		(state) => state.state.activeRootId,
	);
	const sequenceRef = useRef(0);

	const activeRoot =
		roots.find((root) => root.id === activeRootId) ?? roots[0] ?? null;
	const activeGroup = activeRoot?.activeGroupId
		? store.getState().getGroup({
				rootId: activeRoot.id,
				groupId: activeRoot.activeGroupId,
			})
		: null;
	const activePane =
		activeGroup?.activePaneId != null
			? activeGroup.panes.find((pane) => pane.id === activeGroup.activePaneId) ?? null
			: null;

	const nextId = (prefix: string) => {
		sequenceRef.current += 1;
		return `${prefix}-${sequenceRef.current}`;
	};

	const withActiveGroup = (
		callback: (args: { rootId: string; groupId: string }) => void,
	) => {
		if (!activeRoot?.activeGroupId) return;
		callback({
			rootId: activeRoot.id,
			groupId: activeRoot.activeGroupId,
		});
	};

	return (
		<div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-muted/30 px-3 py-2">
			<div className="flex flex-wrap items-center gap-2">
				<Button
					onClick={() =>
						withActiveGroup(({ rootId, groupId }) =>
							store.getState().addPaneToGroup({
								rootId,
								groupId,
								pane: createFilePane({
									id: nextId("pane-file"),
									title: `src/demo/File${sequenceRef.current}.tsx`,
									filePath: `src/demo/File${sequenceRef.current}.tsx`,
									mode: "editor",
									hasChanges: sequenceRef.current % 2 === 0,
									language: "tsx",
									pinned: false,
								}),
								replaceUnpinned: true,
								select: true,
							}),
						)
					}
					size="sm"
					variant="outline"
				>
					<FileCode2 className="size-4" />
					Preview file
				</Button>
				<Button
					onClick={() =>
						withActiveGroup(({ rootId, groupId }) =>
							store.getState().addPaneToGroup({
								rootId,
								groupId,
								pane: createTerminalPane({
									id: nextId("pane-terminal"),
									title: `Terminal ${sequenceRef.current}`,
									sessionKey: `${workspaceBranch}:terminal-${sequenceRef.current}`,
									cwd: `/workspace/${workspaceName}`,
									launchMode: "workspace-shell",
									isPersistent: true,
								}),
								select: true,
							}),
						)
					}
					size="sm"
					variant="outline"
				>
					<TerminalSquare className="size-4" />
					Add terminal
				</Button>
				<Button
					onClick={() =>
						withActiveGroup(({ rootId, groupId }) =>
							store.getState().addPaneToGroup({
								rootId,
								groupId,
								pane: createBrowserPane({
									id: nextId("pane-browser"),
									title: `Preview ${sequenceRef.current}`,
									url: `http://localhost:3000/preview/${sequenceRef.current}`,
									mode: "preview",
								}),
								select: true,
							}),
						)
					}
					size="sm"
					variant="outline"
				>
					<Globe className="size-4" />
					Add browser
				</Button>
				<Button
					onClick={() =>
						withActiveGroup(({ rootId, groupId }) =>
							store.getState().splitGroup({
								rootId,
								groupId,
								position: "right",
								newGroupId: nextId("group-right"),
								newPane: createTerminalPane({
									id: nextId("pane-split-terminal"),
									title: `Split terminal ${sequenceRef.current}`,
									sessionKey: `${workspaceBranch}:split-${sequenceRef.current}`,
									cwd: `/workspace/${workspaceName}`,
									launchMode: "workspace-shell",
									isPersistent: true,
								}),
							}),
						)
					}
					size="sm"
					variant="outline"
				>
					<SquareSplitHorizontal className="size-4" />
					Split right
				</Button>
				<Button
					onClick={() =>
						withActiveGroup(({ rootId, groupId }) =>
							store.getState().splitGroup({
								rootId,
								groupId,
								position: "bottom",
								newGroupId: nextId("group-bottom"),
								newPane: createChatPane({
									id: nextId("pane-split-chat"),
									title: `Chat ${sequenceRef.current}`,
									sessionId: null,
									model: "gpt-5.4-mini",
									hasDraft: false,
								}),
							}),
						)
					}
					size="sm"
					variant="outline"
				>
					<SquareSplitVertical className="size-4" />
					Split down
				</Button>
				<Button
					disabled={!activeRoot || !activeGroup || !activePane}
					onClick={() => {
						if (!activeRoot || !activeGroup || !activePane) return;
						store.getState().setPanePinned({
							rootId: activeRoot.id,
							groupId: activeGroup.id,
							paneId: activePane.id,
							pinned: true,
						});
					}}
					size="sm"
					variant="outline"
				>
					<Pin className="size-4" />
					Pin active
				</Button>
			</div>
			<div className="min-w-0 text-right text-xs text-muted-foreground">
				<div>{activeRoot?.titleOverride ?? activeRoot?.id ?? "No root"}</div>
				<div className="truncate">
					{activePane
						? `${activeGroup?.id ?? "group"} / ${activePane.titleOverride ?? activePane.id}`
						: "No active pane"}
				</div>
			</div>
		</div>
	);
}

export function PaneViewer({
	workspaceBranch,
	workspaceId,
	workspaceName,
}: PaneViewerProps) {
	const [store] = useState(() =>
		createPaneWorkspaceStore<PaneViewerData>({
			initialState: createPaneViewerState({
				workspaceBranch,
				workspaceName,
			}),
		}),
	);

	return (
		<div
			className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
			data-workspace-id={workspaceId}
		>
			<PaneViewerToolbar
				store={store}
				workspaceBranch={workspaceBranch}
				workspaceName={workspaceName}
			/>
			<PaneWorkspace
				className="rounded-none border-0"
				onAddRoot={({ store }) =>
					store.getState().addRoot(
						createPaneRoot({
							id: `root-${crypto.randomUUID()}`,
							titleOverride: "New root",
							groupId: `group-${crypto.randomUUID()}`,
							panes: [
								createChatPane({
									id: `pane-root-${crypto.randomUUID()}`,
									title: "Scratchpad",
									sessionId: null,
									model: "gpt-5.4",
									hasDraft: false,
								}),
							],
						}),
					)
				}
				renderAddRootMenu={({ store }) => (
					<>
						<DropdownMenuItem
							onClick={() =>
								store.getState().addRoot(
									createPaneRoot({
										id: `root-${crypto.randomUUID()}`,
										titleOverride: "Terminal",
										groupId: `group-${crypto.randomUUID()}`,
										panes: [
											createTerminalPane({
												id: `pane-root-${crypto.randomUUID()}`,
												title: "Terminal",
												sessionKey: `${workspaceBranch}:root-${crypto.randomUUID()}`,
												cwd: `/workspace/${workspaceName}`,
												launchMode: "workspace-shell",
												isPersistent: true,
											}),
										],
									}),
								)
							}
						>
							<TerminalSquare className="size-4" />
							<span>Terminal</span>
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() =>
								store.getState().addRoot(
									createPaneRoot({
										id: `root-${crypto.randomUUID()}`,
										titleOverride: "Chat",
										groupId: `group-${crypto.randomUUID()}`,
										panes: [
											createChatPane({
												id: `pane-root-${crypto.randomUUID()}`,
												title: "Chat",
												sessionId: null,
												model: "gpt-5.4",
												hasDraft: false,
											}),
										],
									}),
								)
							}
						>
							<MessageSquare className="size-4" />
							<span>Chat</span>
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() =>
								store.getState().addRoot(
									createPaneRoot({
										id: `root-${crypto.randomUUID()}`,
										titleOverride: "Browser",
										groupId: `group-${crypto.randomUUID()}`,
										panes: [
											createBrowserPane({
												id: `pane-root-${crypto.randomUUID()}`,
												title: "Browser",
												url: "http://localhost:3000",
												mode: "preview",
											}),
										],
									}),
								)
							}
						>
							<Globe className="size-4" />
							<span>Browser</span>
						</DropdownMenuItem>
					</>
				)}
				registry={paneRegistry}
				store={store}
			/>
		</div>
	);
}
