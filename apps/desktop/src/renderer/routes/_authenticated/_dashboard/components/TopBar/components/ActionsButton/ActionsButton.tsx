import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
	HiChevronDown,
	HiMiniCheck,
	HiMiniCog6Tooth,
	HiMiniPlay,
	HiMiniPlus,
} from "react-icons/hi2";
import { getIconComponent } from "renderer/components/IconPicker";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	buildTerminalCommand,
	launchCommandInPane,
} from "renderer/lib/terminal/launch-command";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { ActionIconKey, WorkspaceAction } from "shared/types/config";
import { AddActionDialog } from "./components/AddActionDialog";

interface ActionsButtonProps {
	workspaceId: string;
	projectId?: string | null;
	worktreePath?: string | null;
}

type ResolvedAction = {
	id: string;
	name: string;
	command: string;
	icon?: ActionIconKey;
};

export const ActionsButton = memo(function ActionsButton({
	workspaceId,
	projectId,
	worktreePath,
}: ActionsButtonProps) {
	const navigate = useNavigate();
	const isLaunchingRef = useRef(false);
	const [isPending, setIsPending] = useState(false);
	const [addDialogOpen, setAddDialogOpen] = useState(false);

	const addTab = useTabsStore((s) => s.addTab);
	const setPaneName = useTabsStore((s) => s.setPaneName);
	const setActiveTab = useTabsStore((s) => s.setActiveTab);
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);

	const { data: actionsData } =
		electronTrpc.workspaces.getResolvedActions.useQuery(
			{ workspaceId },
			{ enabled: !!workspaceId },
		);

	const actions: ResolvedAction[] = actionsData?.actions ?? [];
	const lastUsedActionId = actionsData?.lastUsedActionId ?? null;

	const surfacedAction = useMemo<ResolvedAction | null>(() => {
		if (actions.length === 0) return null;
		return actions.find((a) => a.id === lastUsedActionId) ?? actions[0];
	}, [actions, lastUsedActionId]);

	const hasActions = actions.length > 0;

	// The existing actions as WorkspaceAction[] for AddActionDialog
	const existingActions: WorkspaceAction[] = actions.map((a) => ({
		id: a.id,
		name: a.name,
		command: a.command,
		icon: a.icon,
	}));

	const launchAction = useCallback(
		async (action: ResolvedAction) => {
			if (isLaunchingRef.current) return;
			isLaunchingRef.current = true;
			setIsPending(true);

			try {
				const command = buildTerminalCommand([action.command]);
				if (!command) return;

				const initialCwd = worktreePath?.trim() ? worktreePath : undefined;
				const { tabId, paneId } = addTab(workspaceId, { initialCwd });

				setPaneName(paneId, action.name);
				setActiveTab(workspaceId, tabId);
				setFocusedPane(tabId, paneId);

				await launchCommandInPane({
					paneId,
					tabId,
					workspaceId,
					command,
					cwd: initialCwd,
					createOrAttach: (input) =>
						electronTrpcClient.terminal.createOrAttach.mutate({
							...input,
							allowKilled: true,
						}),
					write: (input) => electronTrpcClient.terminal.write.mutate(input),
				});

				// Persist last used (fire and forget)
				electronTrpcClient.workspaces.setLastUsedAction
					.mutate({ workspaceId, actionId: action.id })
					.catch((err) =>
						console.error("[actions] Failed to persist last used:", err),
					);
			} catch (err) {
				console.error("[actions] Failed to launch action:", err);
			} finally {
				isLaunchingRef.current = false;
				setIsPending(false);
			}
		},
		[
			addTab,
			setActiveTab,
			setFocusedPane,
			setPaneName,
			workspaceId,
			worktreePath,
		],
	);

	const handleMainClick = useCallback(() => {
		if (!hasActions) {
			setAddDialogOpen(true);
			return;
		}
		if (surfacedAction) void launchAction(surfacedAction);
	}, [hasActions, launchAction, surfacedAction]);

	const handleConfigureClick = useCallback(() => {
		if (!projectId) return;
		void navigate({
			to: "/settings/project/$projectId/general",
			params: { projectId },
			hash: "actions",
		});
	}, [navigate, projectId]);

	const SurfacedIcon = surfacedAction
		? getIconComponent(surfacedAction.icon)
		: HiMiniPlay;

	return (
		<>
			<div className="flex items-center no-drag">
				{/* Main button — runs the surfaced (last-used) action */}
				<button
					type="button"
					onClick={handleMainClick}
					disabled={isPending}
					aria-label={
						surfacedAction ? `Run ${surfacedAction.name}` : "Add action"
					}
					className={cn(
						"group flex items-center gap-1.5 h-6 px-1.5 sm:pl-1.5 sm:pr-2 rounded-l border border-r-0 border-border/60 bg-secondary/50 text-xs font-medium",
						"transition-all duration-150 ease-out",
						"hover:bg-secondary hover:border-border",
						"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
						"active:scale-[0.98]",
						isPending && "opacity-50 pointer-events-none",
						!hasActions &&
							"text-muted-foreground/80 border-border/40 bg-secondary/40",
					)}
				>
					{hasActions ? (
						<SurfacedIcon className="size-3.5 shrink-0" />
					) : (
						<HiMiniPlus className="size-3.5 shrink-0" />
					)}
					<span className="hidden sm:inline">
						{hasActions ? (surfacedAction?.name ?? "Actions") : "Add action"}
					</span>
				</button>

				{/* Dropdown — lists all actions */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							disabled={isPending}
							className={cn(
								"flex items-center justify-center h-6 w-6 rounded-r border border-border/60 bg-secondary/50 text-muted-foreground",
								"transition-all duration-150 ease-out",
								"hover:bg-secondary hover:border-border hover:text-foreground",
								"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
								"active:scale-[0.98]",
								isPending && "opacity-50 pointer-events-none",
								!hasActions &&
									"text-muted-foreground/80 border-border/40 bg-secondary/40",
							)}
						>
							<HiChevronDown className="size-3.5" />
						</button>
					</DropdownMenuTrigger>

					<DropdownMenuContent align="end" className="w-52">
						{hasActions && (
							<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
								app actions
							</DropdownMenuLabel>
						)}

						{actions.map((action) => {
							const Icon = getIconComponent(action.icon);
							const isSurfaced = action.id === surfacedAction?.id;
							return (
								<DropdownMenuItem
									key={action.id}
									onClick={() => void launchAction(action)}
									className={cn(isSurfaced && "font-medium")}
								>
									<Icon className="mr-2 size-4 shrink-0 text-muted-foreground" />
									<span className="truncate flex-1">{action.name}</span>
									{isSurfaced && (
										<HiMiniCheck className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
									)}
								</DropdownMenuItem>
							);
						})}

						{hasActions && <DropdownMenuSeparator />}

						<DropdownMenuItem onClick={() => setAddDialogOpen(true)}>
							<HiMiniPlus className="mr-2 size-4 shrink-0 text-muted-foreground" />
							Add action
						</DropdownMenuItem>

						<DropdownMenuItem
							onClick={handleConfigureClick}
							disabled={!projectId}
						>
							<HiMiniCog6Tooth className="mr-2 size-4 shrink-0 text-muted-foreground" />
							Configure
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<AddActionDialog
				open={addDialogOpen}
				onClose={() => setAddDialogOpen(false)}
				projectId={projectId}
				existingActions={existingActions}
			/>
		</>
	);
});
