import type { ExternalApp } from "@superset/local-db";
import { useParams } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import type { IconType } from "react-icons";
import { BsTerminalPlus } from "react-icons/bs";
import { LuExternalLink, LuSearch, LuTrash2 } from "react-icons/lu";
import { TbMessageCirclePlus, TbWorld } from "react-icons/tb";
import { getAppOption } from "renderer/components/OpenInExternalDropdown";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useWorkspaceDeleteHandler } from "renderer/react-query/workspaces";
import { DeleteWorkspaceDialog } from "renderer/screens/main/components/WorkspaceSidebar/WorkspaceListItem/components/DeleteWorkspaceDialog/DeleteWorkspaceDialog";
import { useHotkeyDisplay } from "renderer/stores/hotkeys";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTabsWithPresets } from "renderer/stores/tabs/useTabsWithPresets";
import { useTheme } from "renderer/stores/theme";
import supersetEmptyStateWordmark from "./assets/superset-empty-state-wordmark.svg";
import { EmptyTabActionButton } from "./components/EmptyTabActionButton";

interface EmptyTabViewProps {
	defaultExternalApp?: ExternalApp | null;
	onOpenInApp: () => void;
	onOpenQuickOpen: () => void;
}

interface EmptyTabAction {
	id: string;
	label: string;
	display: string[];
	icon: IconType;
	onClick: () => void;
}

export function EmptyTabView({
	defaultExternalApp,
	onOpenInApp,
	onOpenQuickOpen,
}: EmptyTabViewProps) {
	const { workspaceId } = useParams({
		from: "/_authenticated/_dashboard/workspace/$workspaceId/",
	});
	const addChatTab = useTabsStore((s) => s.addChatTab);
	const addBrowserTab = useTabsStore((s) => s.addBrowserTab);
	const activeTheme = useTheme();

	const { data: workspace } = electronTrpc.workspaces.get.useQuery({
		id: workspaceId,
	});
	const { addTab } = useTabsWithPresets(workspace?.projectId);
	const { showDeleteDialog, setShowDeleteDialog, handleDeleteClick } =
		useWorkspaceDeleteHandler();

	const newGroupDisplay = useHotkeyDisplay("NEW_GROUP");
	const newChatDisplay = useHotkeyDisplay("NEW_CHAT");
	const quickOpenDisplay = useHotkeyDisplay("QUICK_OPEN");
	const newBrowserDisplay = useHotkeyDisplay("NEW_BROWSER");
	const openInAppDisplay = useHotkeyDisplay("OPEN_IN_APP");

	const handleShowTerminal = useCallback(() => {
		addTab(workspaceId);
	}, [addTab, workspaceId]);

	const handleNewAgent = useCallback(() => {
		addChatTab(workspaceId);
	}, [addChatTab, workspaceId]);

	const handleOpenBrowser = useCallback(() => {
		addBrowserTab(workspaceId);
	}, [addBrowserTab, workspaceId]);

	const openInActionLabel = useMemo(() => {
		if (!defaultExternalApp) return null;
		const appOption = getAppOption(defaultExternalApp);
		const appName = appOption?.displayLabel ?? appOption?.label;
		return appName ? `Open in ${appName}` : null;
	}, [defaultExternalApp]);

	const actions = useMemo<EmptyTabAction[]>(() => {
		const baseActions: EmptyTabAction[] = [
			{
				id: "terminal",
				label: "Open Terminal",
				display: newGroupDisplay,
				icon: BsTerminalPlus,
				onClick: handleShowTerminal,
			},
			{
				id: "new-agent",
				label: "Open Chat",
				display: newChatDisplay,
				icon: TbMessageCirclePlus,
				onClick: handleNewAgent,
			},
		];

		baseActions.push({
			id: "open-browser",
			label: "Open Browser",
			display: newBrowserDisplay,
			icon: TbWorld,
			onClick: handleOpenBrowser,
		});

		if (openInActionLabel) {
			baseActions.push({
				id: "open-in-app",
				label: openInActionLabel,
				display: openInAppDisplay,
				icon: LuExternalLink,
				onClick: onOpenInApp,
			});
		}

		baseActions.push({
			id: "search-files",
			label: "Search Files",
			display: quickOpenDisplay,
			icon: LuSearch,
			onClick: onOpenQuickOpen,
		});

		return baseActions;
	}, [
		handleNewAgent,
		handleOpenBrowser,
		handleShowTerminal,
		newBrowserDisplay,
		newChatDisplay,
		newGroupDisplay,
		openInActionLabel,
		onOpenInApp,
		onOpenQuickOpen,
		openInAppDisplay,
		quickOpenDisplay,
	]);

	return (
		<div className="flex h-full flex-1 items-center justify-center px-6 py-10">
			<div className="w-full max-w-xl">
				<div className="mb-7 flex items-center justify-center py-3">
					<img
						alt="Superset"
						className={`h-8 w-auto select-none ${
							activeTheme?.type === "dark"
								? "opacity-85"
								: "brightness-0 opacity-75"
						}`}
						draggable={false}
						src={supersetEmptyStateWordmark}
					/>
				</div>
				<div className="mx-auto grid w-full max-w-md gap-0.5">
					{actions.map((action) => (
						<EmptyTabActionButton
							key={action.id}
							display={action.display}
							icon={action.icon}
							label={action.label}
							onClick={action.onClick}
						/>
					))}
				</div>
				{workspace && (
					<button
						type="button"
						className="mx-auto mt-6 flex items-center gap-1 text-xs text-muted-foreground/50 transition-colors hover:text-muted-foreground"
						onClick={handleDeleteClick}
					>
						<LuTrash2 className="size-3" />
						Delete workspace
					</button>
				)}
			</div>
			{workspace && (
				<DeleteWorkspaceDialog
					workspaceId={workspaceId}
					workspaceName={workspace.name}
					workspaceType={workspace.type}
					open={showDeleteDialog}
					onOpenChange={setShowDeleteDialog}
				/>
			)}
		</div>
	);
}
