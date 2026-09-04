import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { GoIssueOpened } from "react-icons/go";
import {
	HiOutlinePencilSquare,
	HiOutlineQueueList,
	HiOutlineViewColumns,
	HiXMark,
} from "react-icons/hi2";
import { SiLinear } from "react-icons/si";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { OpenClosedFilter } from "renderer/routes/_authenticated/_dashboard/components/OpenClosedFilter";
import { ProjectFilter } from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter";
import { WorkItemsSearch } from "renderer/routes/_authenticated/_dashboard/components/WorkItemsSearch";
import type { ViewMode } from "../../../../stores/tasks-filter-state";
import type { TaskWithStatus } from "../../hooks/useTasksData";
import type { SelectedIssue } from "../GitHubIssuesContent";
import { AssigneeFilter } from "./components/AssigneeFilter";
import { CreateTaskDialog } from "./components/CreateTaskDialog";
import { LinearProjectFilter } from "./components/LinearProjectFilter";
import { RunInWorkspacePopover } from "./components/RunInWorkspacePopover";
import { RunInWorkspacePopoverV2 } from "./components/RunInWorkspacePopoverV2";
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
export type TaskSource = "tasks" | "issues";

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
	linearProjectFilter: string | null;
	onLinearProjectFilterChange: (projectId: string | null) => void;
	includeClosedIssues: boolean;
	onIncludeClosedIssuesChange: (includeClosed: boolean) => void;
}

const TASK_SOURCES = [
	{ value: "tasks" as const, Icon: SiLinear },
	{ value: "issues" as const, Icon: GoIssueOpened },
] as const;

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
	linearProjectFilter,
	onLinearProjectFilterChange,
	includeClosedIssues,
	onIncludeClosedIssuesChange,
}: TasksTopBarProps) {
	const { t } = useLingui();
	const taskSourceLabels: Record<TaskSource, string> = {
		tasks: t({
			message: "Linear",
		}),
		issues: t({
			message: "GitHub issues",
		}),
	};
	const showTaskOnlyControls = taskSource === "tasks";
	const showIssues = taskSource === "issues";
	const taskSelectedCount = selectedTasks.length;
	const issueSelectedCount = selectedIssues.length;
	const selectedCount = showIssues ? issueSelectedCount : taskSelectedCount;
	const selectedIssueProjectIds = new Set(
		selectedIssues.map((issue) => issue.projectId),
	);
	const selectedIssueProject =
		selectedIssueProjectIds.size === 1
			? (selectedIssueProjectIds.values().next().value ?? null)
			: null;
	const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
	const isV2CloudEnabled = useIsV2CloudEnabled();

	const hasSelection = selectedCount > 0;

	return (
		<>
			<div
				data-tasks-toolbar
				className="@container min-w-0 shrink-0 border-b border-border px-4 py-2"
			>
				<div className="flex flex-col items-stretch gap-2 @4xl:flex-row @4xl:items-center @4xl:justify-between">
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
									value={taskSource}
									onValueChange={(value) =>
										onTaskSourceChange(value as TaskSource)
									}
									className="flex-row gap-0"
								>
									<TabsList className="h-8 gap-0.5 rounded-md bg-muted/50 p-0.5">
										{TASK_SOURCES.map((source) => {
											const Icon = source.Icon;
											return (
												<TabsTrigger
													key={source.value}
													value={source.value}
													className="h-7 rounded-sm px-2 text-xs shadow-none data-[state=active]:shadow-none"
												>
													<Icon className="size-3.5" />
													<span>{taskSourceLabels[source.value]}</span>
												</TabsTrigger>
											);
										})}
									</TabsList>
								</Tabs>

								<div className="h-4 w-px shrink-0 bg-border" />

								{showTaskOnlyControls ? (
									<>
										<LinearProjectFilter
											value={linearProjectFilter}
											onChange={onLinearProjectFilterChange}
										/>
										<div className="h-4 w-px shrink-0 bg-border" />
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

					{/* Window-drag leaf standing in for the hidden TopBar. */}
					<div className="drag hidden min-w-0 flex-1 self-stretch @4xl:block" />

					<div className="flex shrink-0 items-center gap-2">
						{showTaskOnlyControls && (
							<>
								<Button
									variant="outline"
									size="sm"
									className="h-8 gap-1.5 px-3"
									onClick={() => setIsCreateTaskOpen(true)}
								>
									<HiOutlinePencilSquare className="size-4" />
									<span className="hidden @4xl:inline">
										<Trans>New task</Trans>
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
									: t({
											message: "Search tasks…",
										})
							}
							label={
								showIssues
									? t({
											message: "Search GitHub issues",
										})
									: t({
											message: "Search tasks",
										})
							}
						/>
					</div>
				</div>
			</div>

			<CreateTaskDialog
				open={isCreateTaskOpen}
				onOpenChange={setIsCreateTaskOpen}
				currentTab={currentTab}
				searchQuery={searchQuery}
				assigneeFilter={assigneeFilter}
			/>
		</>
	);
}
