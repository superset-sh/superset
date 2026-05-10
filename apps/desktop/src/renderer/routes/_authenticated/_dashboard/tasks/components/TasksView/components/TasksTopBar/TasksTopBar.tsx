import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { cn } from "@superset/ui/utils";
import { useRef, useState } from "react";
import { GoGitPullRequest, GoIssueOpened } from "react-icons/go";
import {
	HiOutlineMagnifyingGlass,
	HiOutlinePencilSquare,
	HiOutlineQueueList,
	HiOutlineViewColumns,
	HiXMark,
} from "react-icons/hi2";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useHotkey } from "renderer/hotkeys";
import type { TypeTab, ViewMode } from "../../../../stores/tasks-filter-state";
import type { TaskWithStatus } from "../../hooks/useTasksData";
import { ActiveIcon } from "../shared/icons/ActiveIcon";
import { AssigneeFilter } from "./components/AssigneeFilter";
import { CreateTaskDialog } from "./components/CreateTaskDialog";
import { ProjectFilter } from "./components/ProjectFilter";
import { RunInWorkspacePopover } from "./components/RunInWorkspacePopover";
import { RunInWorkspacePopoverV2 } from "./components/RunInWorkspacePopoverV2";
import { StatusFilter } from "./components/StatusFilter";

export type TabValue = "all" | "active" | "backlog";

interface TasksTopBarProps {
	currentTab: TabValue;
	onTabChange: (tab: TabValue) => void;
	searchQuery: string;
	onSearchChange: (query: string) => void;
	assigneeFilter: string | null;
	onAssigneeFilterChange: (value: string | null) => void;
	selectedTasks?: TaskWithStatus[];
	onClearSelection?: () => void;
	viewMode: ViewMode;
	onViewModeChange: (mode: ViewMode) => void;
	typeTab: TypeTab;
	onTypeTabChange: (typeTab: TypeTab) => void;
	projectFilter: string | null;
	onProjectFilterChange: (projectId: string) => void;
}

const TYPE_TABS = [
	{ value: "tasks" as const, label: "Tasks", Icon: ActiveIcon },
	{ value: "prs" as const, label: "PRs", Icon: GoGitPullRequest },
	{ value: "issues" as const, label: "Issues", Icon: GoIssueOpened },
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
	viewMode,
	onViewModeChange,
	typeTab,
	onTypeTabChange,
	projectFilter,
	onProjectFilterChange,
}: TasksTopBarProps) {
	const showTaskOnlyControls = typeTab === "tasks";
	const selectedCount = selectedTasks.length;
	const searchInputRef = useRef<HTMLInputElement>(null);
	const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
	const isV2CloudEnabled = useIsV2CloudEnabled();

	useHotkey(
		"FOCUS_TASK_SEARCH",
		() => {
			searchInputRef.current?.focus();
			searchInputRef.current?.select();
		},
		{ preventDefault: true },
	);

	const hasSelection = selectedCount > 0;

	return (
		<>
			<div className="@container flex items-center justify-between border-b border-border px-4 h-11 min-w-0 shrink-0">
				{/* Left side: tabs/filters or selection actions */}
				<div className="flex items-center gap-2 min-w-0">
					{hasSelection ? (
						<>
							<Button
								variant="ghost"
								size="icon-xs"
								onClick={onClearSelection}
								aria-label="Clear selection"
							>
								<HiXMark />
							</Button>
							<span className="text-sm font-medium">
								{selectedCount} selected
							</span>
							<div className="h-4 w-px bg-border" />
							{isV2CloudEnabled ? (
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
							<ProjectFilter
								value={projectFilter}
								onChange={onProjectFilterChange}
							/>

							<div className="h-4 w-px bg-border" />

							<Tabs
								value={typeTab}
								onValueChange={(value) => onTypeTabChange(value as TypeTab)}
							>
								<TabsList className="h-8 bg-transparent p-0 gap-0.5">
									{TYPE_TABS.map((tab) => {
										const Icon = tab.Icon;
										return (
											<TabsTrigger
												key={tab.value}
												value={tab.value}
												title={tab.label}
												className="h-8 rounded-md px-2 gap-1 data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
											>
												<Icon className="h-3.5 w-3.5" />
												<span className="text-sm hidden @5xl:inline">
													{tab.label}
												</span>
											</TabsTrigger>
										);
									})}
								</TabsList>
							</Tabs>

							{showTaskOnlyControls && (
								<>
									<div className="h-4 w-px bg-border" />

									<StatusFilter value={currentTab} onChange={onTabChange} />

									<div className="h-4 w-px bg-border" />

									<AssigneeFilter
										value={assigneeFilter}
										onChange={onAssigneeFilterChange}
									/>
								</>
							)}
						</>
					)}
				</div>

				{/* Right side: create + view toggle + search */}
				<div className="flex items-center gap-2">
					{showTaskOnlyControls && (
						<>
							<Button
								variant="outline"
								size="sm"
								className="h-8 gap-1.5 px-3"
								onClick={() => setIsCreateTaskOpen(true)}
							>
								<HiOutlinePencilSquare className="size-4" />
								<span className="hidden @4xl:inline">New task</span>
							</Button>

							<div className="flex items-center rounded-md border bg-muted/30 p-0.5">
								<button
									type="button"
									title="Table view"
									className={cn(
										"flex items-center justify-center size-6 rounded-sm transition-colors",
										viewMode === "table"
											? "bg-background shadow-sm text-foreground"
											: "text-muted-foreground hover:text-foreground",
									)}
									onClick={() => onViewModeChange("table")}
								>
									<HiOutlineQueueList className="size-3.5" />
								</button>
								<button
									type="button"
									title="Board view"
									className={cn(
										"flex items-center justify-center size-6 rounded-sm transition-colors",
										viewMode === "board"
											? "bg-background shadow-sm text-foreground"
											: "text-muted-foreground hover:text-foreground",
									)}
									onClick={() => onViewModeChange("board")}
								>
									<HiOutlineViewColumns className="size-3.5" />
								</button>
							</div>
						</>
					)}

					<div className="relative w-32 @2xl:w-40 @4xl:w-56 @6xl:w-64">
						<HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
						<Input
							ref={searchInputRef}
							type="text"
							placeholder={
								typeTab === "prs"
									? "Search pull requests..."
									: typeTab === "issues"
										? "Search issues..."
										: "Search tasks..."
							}
							value={searchQuery}
							onChange={(e) => onSearchChange(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Escape") {
									onSearchChange("");
									searchInputRef.current?.blur();
								}
							}}
							className="h-8 pl-9 pr-3 text-sm bg-muted/50 border-0 focus-visible:ring-1"
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
