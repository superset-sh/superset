import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { IconType } from "react-icons";
import { GoIssueOpened } from "react-icons/go";
import {
	HiOutlineClipboardDocumentList,
	HiOutlinePencilSquare,
	HiOutlineQueueList,
	HiOutlineViewColumns,
	HiXMark,
} from "react-icons/hi2";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { CreateTaskDialog } from "renderer/routes/_authenticated/_dashboard/components/CreateTaskDialog";
import { OpenClosedFilter } from "renderer/routes/_authenticated/_dashboard/components/OpenClosedFilter";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { ProjectFilter } from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter";
import { WorkItemsSearch } from "renderer/routes/_authenticated/_dashboard/components/WorkItemsSearch";
import type { ViewMode } from "../../../../stores/tasks-filter-state";
import { RunInWorkspacePopoverV2 } from "../../../RunInWorkspacePopoverV2";
import type { TaskWithStatus } from "../../hooks/useTasksData";
import type { SelectedIssue } from "../GitHubIssuesContent";
import { AssigneeFilter } from "./components/AssigneeFilter";
import { CreateLinearIssueDialog } from "./components/CreateLinearIssueDialog";
import { LinearAssigneeFilter } from "./components/LinearAssigneeFilter";
import { LinearTeamFilter } from "./components/LinearTeamFilter";
import { RunInWorkspacePopover } from "./components/RunInWorkspacePopover";
import { RunIssuesInWorkspacePopover } from "./components/RunIssuesInWorkspacePopover";
import { StatusFilter } from "./components/StatusFilter";

export type TabValue =
	| "all"
	| "active"
	| "backlog"
	| "unstarted"
	| "started"
	| "completed"
	| "canceled";
export type TaskSource = "tasks" | "linear" | "issues";

interface TasksTopBarProps {
	currentTab: TabValue;
	onTabChange: (tab: TabValue) => void;
	searchQuery: string;
	onSearchChange: (query: string) => void;
	assigneeFilter: string | null;
	onAssigneeFilterChange: (value: string | null) => void;
	selectedTasks?: TaskWithStatus[];
	onClearSelection?: () => void;
	selectedIssues?: SelectedIssue[];
	onClearIssueSelection?: () => void;
	viewMode: ViewMode;
	onViewModeChange: (mode: ViewMode) => void;
	taskSource: TaskSource;
	onTaskSourceChange: (taskSource: TaskSource) => void;
	projectFilters: string[];
	onProjectFiltersChange: (projectIds: string[]) => void;
	linearTeamFilter: string | null;
	onLinearTeamFilterChange: (teamId: string | null) => void;
	linearAssigneeFilter: string | null;
	onLinearAssigneeFilterChange: (assignee: string | null) => void;
	includeClosedIssues: boolean;
	onIncludeClosedIssuesChange: (includeClosed: boolean) => void;
}

const SOURCE_TABS: ReadonlyArray<{
	value: Exclude<TaskSource, "linear">;
	Icon: IconType;
}> = [
	{ value: "tasks", Icon: HiOutlineClipboardDocumentList },
	{ value: "issues", Icon: GoIssueOpened },
];

export function TasksTopBar({
	currentTab,
	onTabChange,
	searchQuery,
	onSearchChange,
	assigneeFilter,
	onAssigneeFilterChange,
	selectedTasks = [],
	onClearSelection,
	selectedIssues = [],
	onClearIssueSelection,
	viewMode,
	onViewModeChange,
	taskSource,
	onTaskSourceChange,
	projectFilters,
	onProjectFiltersChange,
	linearTeamFilter,
	onLinearTeamFilterChange,
	linearAssigneeFilter,
	onLinearAssigneeFilterChange,
	includeClosedIssues,
	onIncludeClosedIssuesChange,
}: TasksTopBarProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const sourceTabLabels: Record<Exclude<TaskSource, "linear">, string> = {
		tasks: t({
			message: "Tasks",
		}),
		issues: t({
			message: "GitHub issues",
		}),
	};
	const showTaskOnlyControls = taskSource === "tasks";
	const showLinear = taskSource === "linear";
	const showViewControls = showTaskOnlyControls || showLinear;
	const showIssues = taskSource === "issues";
	const taskSelectedCount = selectedTasks.length;
	const issueSelectedCount = selectedIssues.length;
	const selectedCount = showIssues
		? issueSelectedCount
		: showTaskOnlyControls
			? taskSelectedCount
			: 0;
	const selectedIssueProjectIds = new Set(
		selectedIssues.map((issue) => issue.projectId),
	);
	const selectedIssueProject =
		selectedIssueProjectIds.size === 1
			? (selectedIssueProjectIds.values().next().value ?? null)
			: null;
	const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
	const [isCreateLinearIssueOpen, setIsCreateLinearIssueOpen] = useState(false);
	const isV2CloudEnabled = useIsV2CloudEnabled();

	const hasSelection = selectedCount > 0;

	return (
		<>
			<PageHeader
				className="@container h-auto min-h-12 shadow-[inset_0_-1px_0_var(--border)]"
				contentClassName="flex-col items-stretch gap-2 py-2 @4xl:flex-row @4xl:items-center"
				start={
					<div className="flex min-w-0 items-center gap-3 overflow-x-auto hide-scrollbar">
						{hasSelection ? (
							<>
								<Button
									variant="ghost"
									size="icon-xs"
									onClick={
										showIssues ? onClearIssueSelection : onClearSelection
									}
									aria-label={t({
										message: "Clear selection",
									})}
								>
									<HiXMark />
								</Button>
								<span className="text-sm font-medium">
									<Trans>{selectedCount} selected</Trans>
								</span>
								<div className="h-4 w-px shrink-0 bg-border" />
								{showIssues ? (
									<RunIssuesInWorkspacePopover
										issues={selectedIssues}
										projectFilter={selectedIssueProject}
										onComplete={onClearIssueSelection ?? (() => {})}
									/>
								) : isV2CloudEnabled ? (
									<RunInWorkspacePopoverV2
										tasks={selectedTasks}
										onComplete={onClearSelection ?? (() => {})}
									/>
								) : (
									<RunInWorkspacePopover
										tasks={selectedTasks}
										onComplete={onClearSelection ?? (() => {})}
									/>
								)}
							</>
						) : (
							<>
								<Tabs
									value={taskSource === "issues" ? "issues" : "tasks"}
									onValueChange={(value) =>
										onTaskSourceChange(value as TaskSource)
									}
									className="flex-row gap-0"
								>
									<TabsList className="h-8 gap-0.5 rounded-md bg-muted/50 p-0.5">
										{SOURCE_TABS.map((source) => {
											const Icon = source.Icon;
											return (
												<TabsTrigger
													key={source.value}
													value={source.value}
													className="h-7 rounded-sm px-2 text-xs shadow-none data-[state=active]:shadow-none"
												>
													<Icon className="size-3.5" />
													<span>{sourceTabLabels[source.value]}</span>
												</TabsTrigger>
											);
										})}
									</TabsList>
								</Tabs>

								<div className="h-4 w-px shrink-0 bg-border" />

								{showLinear ? (
									<>
										<LinearTeamFilter
											value={linearTeamFilter}
											onChange={onLinearTeamFilterChange}
										/>
										<StatusFilter value={currentTab} onChange={onTabChange} />
										<div className="h-4 w-px shrink-0 bg-border" />
										<LinearAssigneeFilter
											value={linearAssigneeFilter}
											onChange={onLinearAssigneeFilterChange}
										/>
									</>
								) : showTaskOnlyControls ? (
									<>
										<StatusFilter value={currentTab} onChange={onTabChange} />
										<div className="h-4 w-px shrink-0 bg-border" />
										<AssigneeFilter
											value={assigneeFilter}
											onChange={onAssigneeFilterChange}
										/>
									</>
								) : (
									<>
										<div className="flex items-center gap-2">
											<span className="text-xs text-muted-foreground">
												<Trans>Repository</Trans>
											</span>
											<ProjectFilter
												value={projectFilters}
												onChange={onProjectFiltersChange}
											/>
										</div>
										<div className="h-4 w-px shrink-0 bg-border" />
										<OpenClosedFilter
											includeClosed={includeClosedIssues}
											onChange={onIncludeClosedIssuesChange}
										/>
									</>
								)}
							</>
						)}
					</div>
				}
				end={
					<div className="flex shrink-0 items-center gap-2">
						{showViewControls && (
							<>
								<Button
									variant="outline"
									size="sm"
									className="h-8 gap-1.5 px-3"
									onClick={() =>
										showLinear
											? setIsCreateLinearIssueOpen(true)
											: setIsCreateTaskOpen(true)
									}
								>
									<HiOutlinePencilSquare className="size-4" />
									<span className="hidden @4xl:inline">
										{showLinear ? (
											<Trans>New issue</Trans>
										) : (
											<Trans>New task</Trans>
										)}
									</span>
								</Button>

								<fieldset
									className="flex items-center rounded-md border bg-muted/30 p-0.5"
									aria-label={t({
										message: "Task layout",
									})}
								>
									<button
										type="button"
										title={t({
											message: "Table view",
										})}
										aria-label={t({
											message: "Table view",
										})}
										aria-pressed={viewMode === "table"}
										className={cn(
											"flex size-6 items-center justify-center rounded-sm transition-colors",
											viewMode === "table"
												? "bg-background text-foreground shadow-sm"
												: "text-muted-foreground hover:text-foreground",
										)}
										onClick={() => onViewModeChange("table")}
									>
										<HiOutlineQueueList className="size-3.5" />
									</button>
									<button
										type="button"
										title={t({
											message: "Board view",
										})}
										aria-label={t({
											message: "Board view",
										})}
										aria-pressed={viewMode === "board"}
										className={cn(
											"flex size-6 items-center justify-center rounded-sm transition-colors",
											viewMode === "board"
												? "bg-background text-foreground shadow-sm"
												: "text-muted-foreground hover:text-foreground",
										)}
										onClick={() => onViewModeChange("board")}
									>
										<HiOutlineViewColumns className="size-3.5" />
									</button>
								</fieldset>
							</>
						)}

						<WorkItemsSearch
							value={searchQuery}
							onChange={onSearchChange}
							placeholder={
								showIssues
									? t({
											message: "Search GitHub issues…",
										})
									: showLinear
										? t({ message: "Search Linear…" })
										: t({
												message: "Search tasks…",
											})
							}
							label={
								showIssues
									? t({
											message: "Search GitHub issues",
										})
									: showLinear
										? t({ message: "Search Linear" })
										: t({
												message: "Search tasks",
											})
							}
						/>
					</div>
				}
			/>

			<CreateLinearIssueDialog
				open={isCreateLinearIssueOpen}
				onOpenChange={setIsCreateLinearIssueOpen}
				defaultTeamId={linearTeamFilter}
			/>

			<CreateTaskDialog
				open={isCreateTaskOpen}
				onOpenChange={setIsCreateTaskOpen}
				onCreated={(task) => {
					const search: Record<string, string> = {};
					if (currentTab !== "all") search.tab = currentTab;
					if (assigneeFilter) search.assignee = assigneeFilter;
					if (searchQuery) search.search = searchQuery;
					navigate({
						to: "/tasks/$taskId",
						params: { taskId: task.id },
						search,
					});
				}}
			/>
		</>
	);
}
