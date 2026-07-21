import type {
	SelectAutomation,
	SelectAutomationRun,
	SelectUser,
} from "@superset/db/schema";
import { describeSchedule } from "@superset/shared/rrule";
import { Badge } from "@superset/ui/badge";
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
import { HiOutlineComputerDesktop } from "react-icons/hi2";
import { LuEllipsis, LuGitBranch, LuSparkles } from "react-icons/lu";
import type { ProjectOption } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/types";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { AgentCell } from "../AgentCell";
import { CellWithIcon } from "../CellWithIcon";
import { AutomationActionsMenuItems } from "./components/AutomationActionsMenuItems";

interface AutomationRowProps {
	automation: SelectAutomation;
	owner: Pick<SelectUser, "id" | "name" | "email"> | undefined;
	showOwner: boolean;
	project: ProjectOption | undefined;
	workspaceLabel: string;
	hostLabel: string;
	/** The automation's most recent run status; null when it has no runs. */
	lastRunStatus: SelectAutomationRun["status"] | null;
	isOwner: boolean;
	onRunNow: (automation: SelectAutomation) => void;
	onDelete: (automation: SelectAutomation) => void;
}

const LAST_RUN_META: Record<
	SelectAutomationRun["status"],
	{ dot: string; label: string; failed?: boolean }
> = {
	dispatched: { dot: "bg-emerald-500", label: "ran" },
	dispatching: { dot: "bg-amber-500", label: "running" },
	skipped_offline: { dot: "bg-red-500", label: "failed", failed: true },
	dispatch_failed: { dot: "bg-red-500", label: "failed", failed: true },
};

export function AutomationRow({
	automation,
	owner,
	showOwner,
	project,
	workspaceLabel,
	hostLabel,
	lastRunStatus,
	isOwner,
	onRunNow,
	onDelete,
}: AutomationRowProps) {
	const navigate = useNavigate();
	const scheduleLabel = describeSchedule(automation.rrule);

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

	const actionsMenuItems = (kind: "context" | "dropdown") => (
		<AutomationActionsMenuItems
			kind={kind}
			isOwner={isOwner}
			onEdit={openDetail}
			onRunNow={() => onRunNow(automation)}
			onHistory={openHistory}
			onDelete={() => onDelete(automation)}
		/>
	);

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
									"inline-block size-2 shrink-0 rounded-full",
									automation.enabled
										? "bg-emerald-500"
										: "border border-muted-foreground/60",
								)}
							/>
							<span
								className={cn(
									"min-w-0 truncate font-medium",
									!automation.enabled && "text-muted-foreground",
								)}
								title={automation.name}
							>
								{automation.name}
							</span>
							{!automation.enabled && (
								<Badge variant="secondary" className="shrink-0 text-[10px]">
									paused
								</Badge>
							)}
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

					<TableCell className="text-xs text-muted-foreground">
						<span className="flex min-w-0 items-center gap-1.5">
							{project ? (
								<ProjectThumbnail
									projectName={project.name}
									iconUrl={project.iconUrl}
									className="!size-3.5 shrink-0"
								/>
							) : null}
							<span className="min-w-0 truncate">{project?.name ?? "—"}</span>
						</span>
					</TableCell>

					<TableCell className="text-xs text-muted-foreground">
						<CellWithIcon
							icon={
								automation.v2WorkspaceId ? (
									<LuGitBranch className="size-3 shrink-0" />
								) : (
									<LuSparkles className="size-3 shrink-0" />
								)
							}
							label={workspaceLabel}
						/>
					</TableCell>

					<TableCell className="text-xs text-muted-foreground">
						<CellWithIcon
							icon={<HiOutlineComputerDesktop className="size-3 shrink-0" />}
							label={hostLabel}
						/>
					</TableCell>

					<TableCell className="text-xs text-muted-foreground">
						<AgentCell
							agentId={automation.agent}
							hostId={automation.targetHostId ?? null}
						/>
					</TableCell>

					<TableCell
						className="truncate text-xs text-muted-foreground"
						title={scheduleLabel}
					>
						{scheduleLabel}
					</TableCell>

					<TableCell className="text-xs text-muted-foreground">
						{lastRunStatus ? (
							(() => {
								const meta = LAST_RUN_META[lastRunStatus];
								const cell = (
									<span
										className={cn(
											"flex items-center gap-1.5",
											meta.failed && "text-red-600 dark:text-red-400",
										)}
									>
										<span
											className={cn(
												"inline-block size-1.5 shrink-0 rounded-full",
												meta.dot,
											)}
										/>
										{meta.label}
									</span>
								);
								return meta.failed ? (
									<Tooltip>
										<TooltipTrigger asChild>{cell}</TooltipTrigger>
										<TooltipContent>
											The last run failed. Click to see why.
										</TooltipContent>
									</Tooltip>
								) : (
									cell
								);
							})()
						) : (
							<span>—</span>
						)}
					</TableCell>

					<TableCell className="pr-4">
						<span className="flex items-center justify-end">
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
