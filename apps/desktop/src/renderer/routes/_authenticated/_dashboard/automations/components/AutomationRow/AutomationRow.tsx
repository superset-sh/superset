import type { SelectAutomationRun, SelectUser } from "@superset/db/schema";
import {
	describeSchedule,
	formatDateTimeInTimezone,
} from "@superset/shared/rrule";
import type { RouterOutputs } from "@superset/trpc";
import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { TableCell, TableRow } from "@superset/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { LuEllipsis, LuPlay, LuRotateCw } from "react-icons/lu";
import type { AutomationLastRun } from "renderer/routes/_authenticated/_dashboard/hooks/useFailedAutomations";
import type { ProjectOption } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/types";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { AutomationActionsMenuItems } from "./components/AutomationActionsMenuItems";

type AutomationListItem = RouterOutputs["automation"]["list"][number];

interface AutomationRowProps {
	automation: AutomationListItem;
	owner: Pick<SelectUser, "id" | "name" | "email"> | undefined;
	showOwner: boolean;
	project: ProjectOption | undefined;
	/** True when the automation targets sessions (no project). */
	isSession?: boolean;
	/** The automation's most recent run; null when it has no runs. */
	lastRun: AutomationLastRun | null;
	/** Shared ticking clock so relative times stay fresh without per-row timers. */
	now: Date;
	isOwner: boolean;
	/** True while a run/retry dispatch for this automation is in flight. */
	isRetrying: boolean;
	onRunNow: (automation: AutomationListItem) => void;
	onToggleEnabled: (automation: AutomationListItem) => void;
	onDelete: (automation: AutomationListItem) => void;
}

// A run's terminal success state is workspace creation — say so.
const LAST_RUN_META: Record<
	SelectAutomationRun["status"],
	{ dot: string; label: string; failed?: boolean }
> = {
	dispatched: { dot: "bg-emerald-500", label: "created" },
	dispatching: { dot: "bg-amber-500", label: "creating" },
	skipped_offline: { dot: "bg-red-500", label: "failed", failed: true },
	dispatch_failed: { dot: "bg-red-500", label: "failed", failed: true },
	// Neither created a workspace, so neither is `failed` — that flag offers to
	// open one.
	debounced: { dot: "bg-slate-400", label: "superseded" },
	rejected: { dot: "bg-amber-500", label: "blocked" },
};

function compactUntil(at: number, now: Date): string {
	const minutes = Math.floor((at - now.getTime()) / 60_000);
	if (minutes < 1) return "soon";
	if (minutes < 60) return `in ${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `in ${hours}h`;
	return `in ${Math.floor(hours / 24)}d`;
}

function compactAgo(at: number, now: Date): string {
	const minutes = Math.floor((now.getTime() - at) / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}

export function AutomationRow({
	automation,
	owner,
	showOwner,
	project,
	isSession = false,
	lastRun,
	now,
	isOwner,
	isRetrying,
	onRunNow,
	onToggleEnabled,
	onDelete,
}: AutomationRowProps) {
	const navigate = useNavigate();
	// No rrule means the automation is driven by events rather than a clock.
	const scheduleLabel = automation.rrule
		? describeSchedule(automation.rrule)
		: "Event triggered";

	const openDetail = () =>
		navigate({
			to: "/automations/$automationId",
			params: { automationId: automation.id },
		});
	const openHistory = () =>
		navigate({
			to: "/automations/$automationId",
			params: { automationId: automation.id },
			search: { history: true },
		});
	const openLastRunWorkspace = () => {
		if (!lastRun?.v2WorkspaceId) return;
		localStorage.setItem("lastViewedWorkspaceId", lastRun.v2WorkspaceId);
		navigate({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId: lastRun.v2WorkspaceId },
			search: {
				terminalId: lastRun.terminalSessionId ?? undefined,
			},
		});
	};

	const actionsMenuItems = (kind: "context" | "dropdown") => (
		<AutomationActionsMenuItems
			kind={kind}
			isOwner={isOwner}
			enabled={automation.enabled}
			onEdit={openDetail}
			onRunNow={() => onRunNow(automation)}
			onToggleEnabled={() => onToggleEnabled(automation)}
			onHistory={openHistory}
			onDelete={() => onDelete(automation)}
		/>
	);

	const lastRunMeta = lastRun ? LAST_RUN_META[lastRun.status] : null;
	const lastRunClickable = !!lastRun?.v2WorkspaceId;

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<TableRow
					tabIndex={0}
					onClick={openDetail}
					onKeyDown={(event) => {
						if (event.target !== event.currentTarget) return;
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							openDetail();
						}
					}}
					className="group/row h-10 cursor-pointer border-border/50 text-sm outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
				>
					<TableCell className="pl-4">
						<span className="flex min-w-0 items-center gap-2">
							<span
								className={cn(
									"min-w-0 truncate font-medium",
									!automation.enabled && "text-muted-foreground",
								)}
								title={automation.name}
							>
								{automation.name}
							</span>
							{project ? (
								<span className="ml-1 flex min-w-0 shrink items-center gap-1.5 text-xs text-muted-foreground">
									<ProjectThumbnail
										projectName={project.name}
										iconUrl={project.iconUrl}
										className="!size-3.5 shrink-0"
									/>
									<span className="truncate">{project.name}</span>
								</span>
							) : isSession ? (
								<span className="ml-1 shrink-0 text-xs text-muted-foreground">
									Session
								</span>
							) : null}
						</span>
					</TableCell>

					{showOwner && (
						<TableCell
							className="truncate text-xs text-muted-foreground"
							title={owner?.email ?? undefined}
						>
							{owner?.name ?? owner?.email ?? "—"}
						</TableCell>
					)}

					<TableCell
						className="truncate text-xs text-muted-foreground"
						title={scheduleLabel}
					>
						{scheduleLabel}
					</TableCell>

					<TableCell
						className="text-xs text-muted-foreground"
						title={
							automation.enabled && automation.nextRunAt
								? `Next run ${formatDateTimeInTimezone(
										new Date(automation.nextRunAt),
										automation.timezone ?? "UTC",
									)}`
								: undefined
						}
					>
						{automation.enabled ? (
							<span className="truncate">
								Active
								{automation.nextRunAt && (
									<span className="text-muted-foreground/60">
										{" · "}
										{compactUntil(
											new Date(automation.nextRunAt).getTime(),
											now,
										)}
									</span>
								)}
							</span>
						) : (
							"Paused"
						)}
					</TableCell>

					<TableCell className="text-xs text-muted-foreground">
						{lastRun && lastRunMeta ? (
							(() => {
								const cell = (
									<span
										className={cn(
											"flex items-center gap-1.5",
											lastRunMeta.failed && "text-red-600 dark:text-red-400",
										)}
									>
										<span
											className={cn(
												"inline-block size-1.5 shrink-0 rounded-full",
												lastRunMeta.dot,
											)}
										/>
										{lastRunMeta.label}
										<span
											className="truncate text-muted-foreground/70"
											title={new Date(lastRun.at).toLocaleString()}
										>
											{compactAgo(lastRun.at, now)}
										</span>
									</span>
								);
								if (lastRunClickable) {
									return (
										<Tooltip>
											<TooltipTrigger asChild>
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														openLastRunWorkspace();
													}}
													className="rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
												>
													{cell}
												</button>
											</TooltipTrigger>
											<TooltipContent>
												{lastRunMeta.failed
													? "The last run failed. Open its workspace to see why"
													: "Open the run's workspace"}
											</TooltipContent>
										</Tooltip>
									);
								}
								if (lastRunMeta.failed) {
									return (
										<Tooltip>
											<TooltipTrigger asChild>
												<span className="block">{cell}</span>
											</TooltipTrigger>
											<TooltipContent>
												The last run failed. Click the row to see why.
											</TooltipContent>
										</Tooltip>
									);
								}
								return cell;
							})()
						) : (
							<span>—</span>
						)}
					</TableCell>

					<TableCell className="pr-4">
						<span className="flex items-center justify-end gap-0.5">
							{isOwner && (
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon-sm"
											disabled={isRetrying}
											onClick={(e) => {
												e.stopPropagation();
												onRunNow(automation);
											}}
											aria-label={`Run ${automation.name} now`}
											className={cn(
												"opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100",
												isRetrying && "opacity-100",
											)}
										>
											{isRetrying ? (
												<LuRotateCw className="size-4 animate-spin" />
											) : (
												<LuPlay className="size-4" />
											)}
										</Button>
									</TooltipTrigger>
									<TooltipContent>Run now</TooltipContent>
								</Tooltip>
							)}
							{isOwner && (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											variant="ghost"
											size="icon-sm"
											onClick={(e) => e.stopPropagation()}
											aria-label="Row actions"
											className="opacity-0 group-hover/row:opacity-100 data-[state=open]:opacity-100 focus-visible:opacity-100"
										>
											<LuEllipsis className="size-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent
										align="end"
										onClick={(e) => e.stopPropagation()}
									>
										{actionsMenuItems("dropdown")}
									</DropdownMenuContent>
								</DropdownMenu>
							)}
						</span>
					</TableCell>
				</TableRow>
			</ContextMenuTrigger>
			<ContextMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
				{actionsMenuItems("context")}
			</ContextMenuContent>
		</ContextMenu>
	);
}
