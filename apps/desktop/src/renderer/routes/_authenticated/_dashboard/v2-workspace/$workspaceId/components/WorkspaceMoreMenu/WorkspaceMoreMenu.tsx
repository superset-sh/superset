import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Ellipsis, Play, Settings, Square, X } from "lucide-react";
import { useHotkeyDisplay } from "renderer/hotkeys";
import type { WorkspaceRunDefinition } from "shared/workspace-run-definition";
import { useConfigureWorkspaceRun } from "../../hooks/useConfigureWorkspaceRun";
import { useWorkspaceOpenIn } from "../../hooks/useWorkspaceOpenIn";
import { useWorkspaceOpenInTarget } from "../../hooks/useWorkspaceOpenInTarget";
import { WorkspaceOpenInItems } from "./components/WorkspaceOpenInItems";

interface WorkspaceMoreMenuProps {
	workspaceId: string;
	projectId: string | null;
	runDefinition: WorkspaceRunDefinition | null;
	isRunning: boolean;
	isRunPending: boolean;
	canForceStop: boolean;
	onToggleRun: () => void | Promise<void>;
	onForceStopRun: () => void | Promise<void>;
}

export function WorkspaceMoreMenu({
	workspaceId,
	projectId,
	runDefinition,
	isRunning,
	isRunPending,
	canForceStop,
	onToggleRun,
	onForceStopRun,
}: WorkspaceMoreMenuProps) {
	const { t } = useLingui();
	const openInTarget = useWorkspaceOpenInTarget(workspaceId);
	const openIn = useWorkspaceOpenIn({
		worktreePath: openInTarget?.worktreePath ?? null,
		projectId,
	});
	const configureRun = useConfigureWorkspaceRun(projectId, runDefinition);
	const runHotkey = useHotkeyDisplay("RUN_WORKSPACE_COMMAND").text;
	const hasRunCommand = (runDefinition?.commands ?? []).length > 0;
	const label = t({ message: "More actions" });

	return (
		<DropdownMenu>
			<Tooltip delayDuration={500}>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label={label}
							className="no-drag flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground data-[state=open]:bg-accent/50 data-[state=open]:text-foreground"
						>
							<Ellipsis className="size-4" strokeWidth={1.5} />
						</button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom">{label}</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="end" className="min-w-56">
				{openInTarget && (
					<>
						<WorkspaceOpenInItems openIn={openIn} />
						<DropdownMenuSeparator />
					</>
				)}
				<DropdownMenuItem
					disabled={isRunPending}
					onClick={() => {
						if (!hasRunCommand && !isRunning) {
							configureRun();
							return;
						}
						void onToggleRun();
					}}
				>
					{isRunning ? (
						<Square className="size-4" />
					) : hasRunCommand ? (
						<Play className="size-4" />
					) : (
						<Settings className="size-4" />
					)}
					{isRunning ? (
						<Trans>Stop</Trans>
					) : hasRunCommand ? (
						<Trans>Run</Trans>
					) : (
						<Trans>Set Run</Trans>
					)}
					{(isRunning || hasRunCommand) && runHotkey !== "Unassigned" && (
						<DropdownMenuShortcut>{runHotkey}</DropdownMenuShortcut>
					)}
				</DropdownMenuItem>
				{canForceStop && (
					<DropdownMenuItem
						onClick={() => void onForceStopRun()}
						className="text-destructive focus:text-destructive"
					>
						<X className="size-4 text-destructive" />
						<Trans>Force Stop</Trans>
					</DropdownMenuItem>
				)}
				{(isRunning || hasRunCommand) && (
					<DropdownMenuItem onClick={configureRun}>
						<Settings className="size-4" />
						{runDefinition?.source === "terminal-preset" ? (
							<Trans>Edit Run Script</Trans>
						) : (
							<Trans>Configure</Trans>
						)}
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
