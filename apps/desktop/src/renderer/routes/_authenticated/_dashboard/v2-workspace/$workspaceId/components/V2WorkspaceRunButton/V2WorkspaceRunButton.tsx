import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, Play, Settings, Square, X } from "lucide-react";
import { useCallback } from "react";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { useSetSettingsSearchQuery } from "renderer/stores/settings-state";
import type { WorkspaceRunDefinition } from "shared/workspace-run-definition";

interface V2WorkspaceRunButtonProps {
	projectId: string;
	definition: WorkspaceRunDefinition | null;
	isRunning: boolean;
	isPending: boolean;
	canForceStop: boolean;
	onToggle: () => void | Promise<void>;
	onForceStop: () => void | Promise<void>;
}

export function V2WorkspaceRunButton({
	projectId,
	definition,
	isRunning,
	isPending,
	canForceStop,
	onToggle,
	onForceStop,
}: V2WorkspaceRunButtonProps) {
	const navigate = useNavigate();
	const setSettingsSearchQuery = useSetSettingsSearchQuery();
	const hotkeyText = useHotkeyDisplay("RUN_WORKSPACE_COMMAND").text;
	const hasRunCommand = (definition?.commands ?? []).length > 0;

	const handleConfigureClick = useCallback(() => {
		if (definition?.source === "terminal-preset") {
			void navigate({
				to: "/settings/terminal",
				search: { editPresetId: definition.presetId },
			});
			return;
		}

		setSettingsSearchQuery("scripts");
		void navigate({
			to: "/settings/projects/$projectId",
			params: { projectId },
		});
	}, [definition, navigate, projectId, setSettingsSearchQuery]);

	const label = isRunning ? "Stop" : hasRunCommand ? "Run" : "Set Run";
	const Icon = isRunning ? Square : hasRunCommand ? Play : Settings;

	return (
		<div className="flex shrink-0 items-center no-drag">
			<button
				type="button"
				onClick={() => {
					if (!hasRunCommand && !isRunning) {
						handleConfigureClick();
						return;
					}
					void onToggle();
				}}
				disabled={isPending}
				className={cn(
					"group flex h-6 items-center gap-1.5 rounded-l border border-r-0 border-border/60 bg-secondary/50 px-2 text-xs font-medium transition-colors",
					"hover:bg-secondary hover:border-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
					isPending && "pointer-events-none opacity-50",
					isRunning
						? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
						: hasRunCommand
							? "text-foreground"
							: "border-border/40 bg-secondary/40 text-muted-foreground/80",
				)}
				aria-label={
					isRunning
						? "Stop workspace run command"
						: hasRunCommand
							? "Run workspace command"
							: "Configure workspace run command"
				}
			>
				<Icon className="size-3.5 shrink-0" />
				<span>{label}</span>
				{hotkeyText && hotkeyText !== "Unassigned" && (
					<span className="hidden text-[10px] text-muted-foreground/60 sm:inline">
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
							"flex size-6 items-center justify-center rounded-r border border-border/60 bg-secondary/50 text-muted-foreground transition-colors",
							"hover:bg-secondary hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
							isPending && "pointer-events-none opacity-50",
							isRunning &&
								"border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20",
						)}
						aria-label="Workspace run options"
					>
						<ChevronDown className="size-3.5" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-44">
					{canForceStop && (
						<>
							<DropdownMenuItem
								onClick={() => void onForceStop()}
								className="text-destructive focus:text-destructive"
							>
								<X className="mr-2 size-4 text-destructive" />
								Force Stop
							</DropdownMenuItem>
							<DropdownMenuSeparator />
						</>
					)}
					<DropdownMenuItem onClick={handleConfigureClick}>
						<Settings className="mr-2 size-4" />
						{definition?.source === "terminal-preset"
							? "Edit Run Preset"
							: "Configure"}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
