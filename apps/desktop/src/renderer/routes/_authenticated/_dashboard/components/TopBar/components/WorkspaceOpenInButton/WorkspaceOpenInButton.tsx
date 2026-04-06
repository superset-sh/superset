import type { ExternalApp } from "@superset/local-db";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { and, eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { HiChevronDown } from "react-icons/hi2";
import {
	getAppOption,
	OpenInExternalDropdownItems,
} from "renderer/components/OpenInExternalDropdown";
import { HotkeyLabel, useHotkey, useHotkeyDisplay } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostService } from "renderer/routes/_authenticated/providers/HostServiceProvider/HostServiceProvider";
import { useThemeStore } from "renderer/stores";
import { OpenInMenuButton } from "../OpenInMenuButton";

interface WorkspaceOpenInButtonProps {
	v1WorkspaceId: string | null;
	v2WorkspaceId: string | null;
}

export function WorkspaceOpenInButton({
	v1WorkspaceId,
	v2WorkspaceId,
}: WorkspaceOpenInButtonProps) {
	if (v2WorkspaceId) {
		return <V2Inner workspaceId={v2WorkspaceId} />;
	}
	if (v1WorkspaceId) {
		return <V1Inner workspaceId={v1WorkspaceId} />;
	}
	return null;
}

function V1Inner({ workspaceId }: { workspaceId: string }) {
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId },
		{ enabled: !!workspaceId },
	);

	if (!workspace?.worktreePath) return null;

	return (
		<OpenInMenuButton
			worktreePath={workspace.worktreePath}
			branch={workspace.worktree?.branch}
			projectId={workspace.project?.id}
		/>
	);
}

function V2Inner({ workspaceId }: { workspaceId: string }) {
	const collections = useCollections();
	const { services } = useHostService();
	const activeTheme = useThemeStore((state) => state.activeTheme);
	const { data: deviceInfo } = electronTrpc.auth.getDeviceInfo.useQuery();

	// Persist default app in v2 workspace local state
	const localState = collections.v2WorkspaceLocalState.get(workspaceId);
	const [defaultApp, setDefaultApp] = useState<ExternalApp>(
		(localState?.defaultOpenInApp as ExternalApp) ?? "finder",
	);

	const handleDefaultAppChange = useCallback(
		(app: ExternalApp) => {
			setDefaultApp(app);
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.defaultOpenInApp = app;
			});
		},
		[collections, workspaceId],
	);

	const { data: workspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.where(({ workspaces }) => eq(workspaces.id, workspaceId)),
		[collections, workspaceId],
	);
	const workspace = workspaces[0] ?? null;

	const { data: currentDevices = [] } = useLiveQuery(
		(q) =>
			q
				.from({ devices: collections.v2Devices })
				.where(({ devices }) =>
					and(
						eq(devices.clientId, deviceInfo?.deviceId ?? ""),
						eq(devices.organizationId, workspace?.organizationId ?? ""),
					),
				),
		[collections, deviceInfo?.deviceId, workspace?.organizationId],
	);
	const currentDevice = currentDevices[0] ?? null;

	const hostUrl = workspace
		? (services.get(workspace.organizationId)?.url ?? null)
		: null;
	const isLocalWorkspace =
		Boolean(workspace) && workspace.deviceId === currentDevice?.id;

	const workspaceQuery = useQuery({
		queryKey: ["v2-open-in-workspace", hostUrl, workspaceId],
		queryFn: () =>
			getHostServiceClientByUrl(hostUrl!).workspace.get.query({
				id: workspaceId,
			}),
		enabled: !!workspace && !!hostUrl && isLocalWorkspace,
	});

	const worktreePath = workspaceQuery.data?.worktreePath;
	const branch = workspace?.branch;

	const openInApp = electronTrpc.external.openInApp.useMutation({
		onSuccess: (_data, variables) => {
			handleDefaultAppChange(variables.app);
		},
		onError: (error) => toast.error(`Failed to open: ${error.message}`),
	});
	const copyPath = electronTrpc.external.copyPath.useMutation({
		onSuccess: () => toast.success("Path copied to clipboard"),
		onError: (error) => toast.error(`Failed to copy path: ${error.message}`),
	});

	const currentApp = useMemo(
		() => getAppOption(defaultApp) ?? null,
		[defaultApp],
	);
	const openInDisplay = useHotkeyDisplay("OPEN_IN_APP");
	const copyPathDisplay = useHotkeyDisplay("COPY_PATH");
	const showOpenInShortcut = openInDisplay.text !== "Unassigned";
	const showCopyPathShortcut = copyPathDisplay.text !== "Unassigned";
	const isLoading = openInApp.isPending || copyPath.isPending;
	const isDark = activeTheme?.type === "dark";

	const handleOpenInEditor = useCallback(() => {
		if (!worktreePath || openInApp.isPending || copyPath.isPending) return;
		openInApp.mutate({ path: worktreePath, app: defaultApp });
	}, [worktreePath, defaultApp, openInApp, copyPath.isPending]);

	const handleOpenInOtherApp = useCallback(
		(appId: ExternalApp) => {
			if (!worktreePath || openInApp.isPending || copyPath.isPending) return;
			openInApp.mutate({ path: worktreePath, app: appId });
		},
		[worktreePath, openInApp, copyPath.isPending],
	);

	const handleCopyPath = useCallback(() => {
		if (!worktreePath || openInApp.isPending || copyPath.isPending) return;
		copyPath.mutate(worktreePath);
	}, [worktreePath, copyPath, openInApp.isPending]);

	useHotkey("OPEN_IN_APP", handleOpenInEditor);

	if (!workspace || !hostUrl || !isLocalWorkspace) return null;
	if (!worktreePath) return null;

	return (
		<div className="flex items-center no-drag">
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={handleOpenInEditor}
						disabled={isLoading || !currentApp}
						aria-label={
							currentApp
								? `Open in ${currentApp.displayLabel ?? currentApp.label}`
								: "Open in editor"
						}
						className={cn(
							"group flex items-center gap-1.5 h-6 px-1.5 sm:pl-1.5 sm:pr-2 rounded-l border border-r-0 border-border/60 bg-secondary/50 text-xs font-medium",
							"transition-all duration-150 ease-out",
							"hover:bg-secondary hover:border-border",
							"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
							"active:scale-[0.98]",
							isLoading && "opacity-50 pointer-events-none",
						)}
					>
						{currentApp && (
							<img
								src={isDark ? currentApp.darkIcon : currentApp.lightIcon}
								alt=""
								className="size-3.5 object-contain shrink-0"
							/>
						)}
						{branch && (
							<span className="hidden lg:inline text-muted-foreground truncate max-w-[140px] tabular-nums">
								/{branch}
							</span>
						)}
						<span className="hidden sm:inline text-foreground font-medium">
							Open
						</span>
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={6}>
					{currentApp ? (
						<HotkeyLabel
							label={`Open in ${currentApp.displayLabel ?? currentApp.label}`}
							id="OPEN_IN_APP"
						/>
					) : (
						"Select an editor from the dropdown"
					)}
				</TooltipContent>
			</Tooltip>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						disabled={isLoading}
						className={cn(
							"flex items-center justify-center h-6 w-6 rounded-r border border-border/60 bg-secondary/50 text-muted-foreground",
							"transition-all duration-150 ease-out",
							"hover:bg-secondary hover:border-border hover:text-foreground",
							"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
							"active:scale-[0.98]",
							isLoading && "opacity-50 pointer-events-none",
						)}
					>
						<HiChevronDown className="size-3.5" />
					</button>
				</DropdownMenuTrigger>

				<DropdownMenuContent align="end" className="w-48">
					<OpenInExternalDropdownItems
						isDark={isDark}
						activeApp={defaultApp}
						onOpenIn={handleOpenInOtherApp}
						onCopyPath={handleCopyPath}
						renderAppTrailing={(appId, group) => {
							if (
								appId !== defaultApp ||
								!showOpenInShortcut ||
								group === "jetbrains"
							) {
								return null;
							}
							return (
								<DropdownMenuShortcut>
									{openInDisplay.text}
								</DropdownMenuShortcut>
							);
						}}
						copyPathTrailing={
							showCopyPathShortcut ? (
								<DropdownMenuShortcut>
									{copyPathDisplay.text}
								</DropdownMenuShortcut>
							) : null
						}
						subContentClassName="w-40"
						appContentClassName="gap-0"
						appIconClassName="size-4 object-contain mr-2"
						subTriggerIconClassName="size-4 object-contain mr-2"
						subTriggerContentClassName="flex items-center gap-0"
						copyPathContentClassName="gap-0"
						copyPathIconClassName="mr-2"
					/>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
