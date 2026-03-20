import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { memo, useCallback } from "react";
import { HiMiniCog6Tooth, HiMiniPlay, HiMiniStop } from "react-icons/hi2";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent";
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
	const { isRunning, isPending, toggleWorkspaceRun } = useWorkspaceRunCommand({
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

	const handleClick = useCallback(() => {
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

	const buttonLabel = isRunning ? "Stop" : hasRunCommand ? "Run" : "Set Run";
	const buttonAriaLabel = isRunning
		? "Stop workspace run command"
		: hasRunCommand
			? "Run workspace command"
			: "Configure workspace run command";
	const tooltipLabel = isPending
		? isRunning
			? "Stopping workspace run command"
			: "Starting workspace run command"
		: isRunning
			? "Stop workspace run command"
			: hasRunCommand
				? "Run workspace command"
				: "Configure workspace run command";

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={handleClick}
					disabled={isPending}
					aria-label={buttonAriaLabel}
					className={cn(
						"no-drag flex items-center gap-1.5 h-6 px-2 rounded border border-border/60 bg-secondary/50 text-xs font-medium",
						"transition-all duration-150 ease-out",
						"hover:bg-secondary hover:border-border",
						"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
						"active:scale-[0.98]",
						isPending && "opacity-50 pointer-events-none",
						isRunning
							? "text-emerald-300 border-emerald-500/25 bg-emerald-500/10"
							: hasRunCommand
								? "text-foreground"
								: "text-amber-200 border-amber-500/25 bg-amber-500/10",
					)}
				>
					{isRunning ? (
						<HiMiniStop className="size-3.5 shrink-0" />
					) : hasRunCommand ? (
						<HiMiniPlay className="size-3.5 shrink-0" />
					) : (
						<HiMiniCog6Tooth className="size-3.5 shrink-0" />
					)}
					<span>{buttonLabel}</span>
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom" sideOffset={6}>
				<HotkeyTooltipContent
					label={tooltipLabel}
					hotkeyId="RUN_WORKSPACE_COMMAND"
				/>
			</TooltipContent>
		</Tooltip>
	);
});
