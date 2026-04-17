import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { memo, useCallback } from "react";
import {
	HiChevronDown,
	HiMiniCog6Tooth,
	HiMiniPlay,
	HiMiniStop,
	HiMiniXMark,
} from "react-icons/hi2";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useWorkspaceRunCommand } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/hooks/useWorkspaceRunCommand";
import { useSetSettingsSearchQuery } from "renderer/stores/settings-state";

interface WorkspaceRunButtonProps {
	projectId?: string | null;
	workspaceId: string;
	worktreePath?: string | null;
}

export const WorkspaceRunButton = memo(function WorkspaceRunButton({
	projectId,
	workspaceId,
	worktreePath,
}: WorkspaceRunButtonProps) {
	const navigate = useNavigate();
	const setSettingsSearchQuery = useSetSettingsSearchQuery();
	const hotkeyText = useHotkeyDisplay("RUN_WORKSPACE_COMMAND").text;
	const {
		canForceStop,
		forceStopWorkspaceRun,
		isRunning,
		isPending,
		toggleWorkspaceRun,
	} = useWorkspaceRunCommand({
		workspaceId,
		worktreePath,
	});
	const { data: runConfig } =
		electronTrpc.workspaces.getResolvedRunCommands.useQuery(
			{ workspaceId },
			{ enabled: !!workspaceId },
		);
	const hasRunCommand = (runConfig?.commands ?? []).some(
		(command) => command.trim().length > 0,
	);

	const handleRunClick = useCallback(() => {
		if (!hasRunCommand && projectId) {
			setSettingsSearchQuery("scripts");
			void navigate({
				to: "/settings/project/$projectId/general",
				params: { projectId },
			});
			return;
		}

		void toggleWorkspaceRun();
	}, [
		hasRunCommand,
		navigate,
		projectId,
		setSettingsSearchQuery,
		toggleWorkspaceRun,
	]);

	const handleConfigureClick = useCallback(() => {
		if (!projectId) return;
		setSettingsSearchQuery("scripts");
		void navigate({
			to: "/settings/project/$projectId/general",
			params: { projectId },
		});
	}, [navigate, projectId, setSettingsSearchQuery]);

	const handleForceStopClick = useCallback(() => {
		void forceStopWorkspaceRun();
	}, [forceStopWorkspaceRun]);

	const buttonLabel = isRunning ? "Stop" : hasRunCommand ? "Run" : "Set Run";
	const buttonAriaLabel = isRunning
		? "Stop workspace run command"
		: hasRunCommand
			? "Run workspace command"
			: "Configure workspace run command";

	return (
		<div className="flex items-center no-drag">
			{/* Main button - Run/Stop action */}
			<button
				type="button"
				onClick={handleRunClick}
				disabled={isPending}
				aria-label={buttonAriaLabel}
				className={cn(
					"group flex items-center gap-1.5 h-6 px-1.5 sm:px-2 rounded-l border border-r-0 border-border/60 bg-secondary/50 text-xs font-medium",
					"transition-all duration-150 ease-out",
					"hover:bg-secondary hover:border-border",
					"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
					"active:scale-[0.98]",
					isPending && "opacity-50 pointer-events-none",
					isRunning
						? "text-emerald-300 border-emerald-500/25 bg-emerald-500/10"
						: hasRunCommand
							? "text-foreground"
							: "text-muted-foreground/80 border-border/40 bg-secondary/40",
				)}
			>
				{isRunning ? (
					<HiMiniStop className="size-3.5 shrink-0" />
				) : hasRunCommand ? (
					<HiMiniPlay className="size-3.5 shrink-0" />
				) : (
					<HiMiniCog6Tooth className="size-3.5 shrink-0" />
				)}
				<span className="hidden sm:inline">{buttonLabel}</span>
				{hotkeyText && hotkeyText !== "Unassigned" && (
					<span className="hidden sm:inline text-[10px] text-muted-foreground/60 ml-1">
						{hotkeyText}
					</span>
				)}
			</button>

			{/* Dropdown trigger */}
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
							isRunning
								? "text-emerald-300 border-emerald-500/25 bg-emerald-500/10 hover:bg-emerald-500/20"
								: !hasRunCommand &&
										"text-muted-foreground/80 border-border/40 bg-secondary/40",
						)}
					>
						<HiChevronDown className="size-3.5" />
					</button>
				</DropdownMenuTrigger>

				<DropdownMenuContent align="end" className="w-40">
					{canForceStop && (
						<>
							<DropdownMenuItem
								onClick={handleForceStopClick}
								className="text-destructive focus:text-destructive"
							>
								<HiMiniXMark className="mr-2 size-4 text-destructive" />
								Force Stop
							</DropdownMenuItem>
							<DropdownMenuSeparator />
						</>
					)}
					<DropdownMenuItem onClick={handleConfigureClick}>
						<HiMiniCog6Tooth className="mr-2 size-4" />
						Configure
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
});
