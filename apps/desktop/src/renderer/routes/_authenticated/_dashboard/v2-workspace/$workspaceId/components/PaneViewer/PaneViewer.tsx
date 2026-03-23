import {
	PaneWorkspace,
	createPaneRoot,
	createPaneWorkspaceStore,
	usePaneWorkspaceStore,
	type PaneRegistry,
} from "@superset/pane-layout";
import { Button } from "@superset/ui/button";
import {
	DropdownMenuCheckboxItem,
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import {
	Bug,
	FileCode2,
	Globe,
	MessageSquare,
	TerminalSquare,
} from "lucide-react";
import { useCallback, useState } from "react";
import { BsTerminalPlus } from "react-icons/bs";
import { TbMessageCirclePlus, TbWorld } from "react-icons/tb";
import { HotkeyMenuShortcut } from "renderer/components/HotkeyMenuShortcut";
import { PresetsBar } from "renderer/screens/main/components/WorkspaceView/ContentView/components/PresetsBar";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { DEFAULT_SHOW_PRESETS_BAR } from "shared/constants";
import {
	createBrowserPane,
	createChatPane,
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

export function PaneViewer({
	workspaceBranch,
	workspaceId,
	workspaceName,
}: PaneViewerProps) {
	const utils = electronTrpc.useUtils();
	const { data: showPresetsBar } =
		electronTrpc.settings.getShowPresetsBar.useQuery();
	const setShowPresetsBar = electronTrpc.settings.setShowPresetsBar.useMutation({
		onMutate: async ({ enabled }) => {
			await utils.settings.getShowPresetsBar.cancel();
			const previous = utils.settings.getShowPresetsBar.getData();
			utils.settings.getShowPresetsBar.setData(undefined, enabled);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous !== undefined) {
				utils.settings.getShowPresetsBar.setData(undefined, context.previous);
			}
		},
		onSettled: () => {
			utils.settings.getShowPresetsBar.invalidate();
		},
	});
	const [store] = useState(() =>
		createPaneWorkspaceStore<PaneViewerData>({
			initialState: createPaneViewerState({
				workspaceBranch,
				workspaceName,
			}),
		}),
	);

	const addTerminalRoot = useCallback(() => {
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
					}),
				],
			}),
		);
	}, [store, workspaceBranch, workspaceName]);

	const addChatRoot = useCallback(() => {
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
		);
	}, [store]);

	const addBrowserRoot = useCallback(() => {
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
		);
	}, [store]);

	useAppHotkey("NEW_GROUP", addTerminalRoot, undefined, [addTerminalRoot]);
	useAppHotkey("NEW_CHAT", addChatRoot, undefined, [addChatRoot]);
	useAppHotkey("NEW_BROWSER", addBrowserRoot, undefined, [addBrowserRoot]);

	return (
		<div
			className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
			data-workspace-id={workspaceId}
		>
			<PaneWorkspace
				className="rounded-none border-0"
				onAddRoot={addTerminalRoot}
				renderAddRootMenu={() => (
					<>
						<DropdownMenuItem className="gap-2" onClick={addTerminalRoot}>
							<BsTerminalPlus className="size-4" />
							<span>Terminal</span>
							<HotkeyMenuShortcut hotkeyId="NEW_GROUP" />
						</DropdownMenuItem>
						<DropdownMenuItem className="gap-2" onClick={addChatRoot}>
							<TbMessageCirclePlus className="size-4" />
							<span>Chat</span>
							<HotkeyMenuShortcut hotkeyId="NEW_CHAT" />
						</DropdownMenuItem>
						<DropdownMenuItem className="gap-2" onClick={addBrowserRoot}>
							<TbWorld className="size-4" />
							<span>Browser</span>
							<HotkeyMenuShortcut hotkeyId="NEW_BROWSER" />
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuCheckboxItem
							checked={showPresetsBar ?? DEFAULT_SHOW_PRESETS_BAR}
							onCheckedChange={(checked) =>
								setShowPresetsBar.mutate({ enabled: checked === true })
							}
							onSelect={(event) => event.preventDefault()}
						>
							Show Preset Bar
						</DropdownMenuCheckboxItem>
					</>
				)}
				renderBelowRootTabs={() =>
					(showPresetsBar ?? DEFAULT_SHOW_PRESETS_BAR) ? <PresetsBar /> : null
				}
				registry={paneRegistry}
				store={store}
			/>
		</div>
	);
}
