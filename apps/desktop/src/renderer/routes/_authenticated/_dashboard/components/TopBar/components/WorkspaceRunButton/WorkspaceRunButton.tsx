import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
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
} from "react-icons/hi2";
import { useWorkspaceRunCommand } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/hooks/useWorkspaceRunCommand";
import { useHotkeyText } from "renderer/stores/hotkeys";
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
	const hotkeyText = useHotkeyText("RUN_WORKSPACE_COMMAND");
	const { hasRunCommand, isPending, toggleWorkspaceRun, uiState } =
		useWorkspaceRunCommand({ workspaceId, worktreePath });

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

	const isRunning = uiState === "running" || uiState === "stopping";
	const isSetupState = uiState === "setup";
	const buttonLabel = isRunning ? "Stop" : isSetupState ? "Set Run" : "Run";
	const buttonAriaLabel = isRunning
		? "Stop workspace run command"
		: isSetupState
			? "Configure workspace run command"
			: "Run workspace command";

	return (
		<div className="flex items-center no-drag">
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
						? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
						: hasRunCommand
							? "text-foreground"
							: "text-muted-foreground/80 border-border/40 bg-secondary/40",
				)}
			>
				{isRunning ? (
					<HiMiniStop className="size-3.5 shrink-0" />
				) : isSetupState ? (
					<HiMiniCog6Tooth className="size-3.5 shrink-0" />
				) : (
					<HiMiniPlay className="size-3.5 shrink-0" />
				)}
				<span className="hidden sm:inline">{buttonLabel}</span>
				{hotkeyText && hotkeyText !== "Unassigned" && (
					<span className="hidden sm:inline text-[10px] text-muted-foreground/60 ml-1">
						{hotkeyText}
					</span>
				)}
			</button>

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
						)}
					>
						<HiChevronDown className="size-3.5" />
					</button>
				</DropdownMenuTrigger>

				<DropdownMenuContent align="end" className="w-40">
					<DropdownMenuItem onClick={handleConfigureClick}>
						<HiMiniCog6Tooth className="mr-2 size-4" />
						Configure
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
});
