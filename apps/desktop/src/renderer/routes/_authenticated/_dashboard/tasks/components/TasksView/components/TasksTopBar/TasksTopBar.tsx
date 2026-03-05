import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { useRef } from "react";
import {
	HiChevronDown,
	HiOutlineMagnifyingGlass,
	HiXMark,
} from "react-icons/hi2";
import { LuFolderOpen, LuPlay } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ProjectThumbnail } from "renderer/screens/main/components/WorkspaceSidebar/ProjectSection/ProjectThumbnail";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { ActiveIcon } from "../shared/icons/ActiveIcon";
import { AllIssuesIcon } from "../shared/icons/AllIssuesIcon";
import { BacklogIcon } from "../shared/icons/BacklogIcon";
import { AssigneeFilter } from "./components/AssigneeFilter";

export type TabValue = "all" | "active" | "backlog";

interface TasksTopBarProps {
	currentTab: TabValue;
	onTabChange: (tab: TabValue) => void;
	searchQuery: string;
	onSearchChange: (query: string) => void;
	assigneeFilter: string | null;
	onAssigneeFilterChange: (value: string | null) => void;
	selectedCount?: number;
	onStartWorking?: (projectId?: string) => void;
	onImportRepo?: () => void;
	onClearSelection?: () => void;
}

const TABS = [
	{
		value: "all" as const,
		label: "All issues",
		Icon: AllIssuesIcon,
	},
	{
		value: "active" as const,
		label: "Active",
		Icon: ActiveIcon,
	},
	{
		value: "backlog" as const,
		label: "Backlog",
		Icon: BacklogIcon,
	},
] as const;

export function TasksTopBar({
	currentTab,
	onTabChange,
	searchQuery,
	onSearchChange,
	assigneeFilter,
	onAssigneeFilterChange,
	selectedCount = 0,
	onStartWorking,
	onImportRepo,
	onClearSelection,
}: TasksTopBarProps) {
	const searchInputRef = useRef<HTMLInputElement>(null);

	useAppHotkey(
		"FOCUS_TASK_SEARCH",
		() => {
			searchInputRef.current?.focus();
			searchInputRef.current?.select();
		},
		{ preventDefault: true },
	);

	const { data: recentProjects = [] } =
		electronTrpc.projects.getRecents.useQuery();

	const hasSelection = selectedCount > 0;

	return (
		<div className="flex items-center justify-between border-b border-border px-4 h-11">
			{/* Left side: tabs/filters or selection actions */}
			<div className="flex items-center gap-2">
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
						<div className="flex items-center">
							<Button
								variant="default"
								size="xs"
								className="rounded-r-none"
								onClick={() => onStartWorking?.()}
							>
								<LuPlay />
								Run with Agent
							</Button>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="default"
										size="xs"
										className="rounded-l-none border-l border-primary-foreground/20 px-1.5"
									>
										<HiChevronDown className="size-3.5" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="start">
									{recentProjects.length === 0 ? (
										<DropdownMenuItem disabled>
											No projects found
										</DropdownMenuItem>
									) : (
										recentProjects
											.filter((project) => project.id)
											.map((project) => (
												<DropdownMenuItem
													key={project.id}
													onClick={() => onStartWorking?.(project.id)}
													className="flex items-center gap-2"
												>
													<ProjectThumbnail
														projectId={project.id}
														projectName={project.name}
														projectColor={project.color}
														githubOwner={project.githubOwner}
														hideImage={project.hideImage ?? undefined}
														iconUrl={project.iconUrl}
														className="size-4"
													/>
													{project.name}
												</DropdownMenuItem>
											))
									)}
									<DropdownMenuSeparator />
									<DropdownMenuItem onClick={onImportRepo}>
										<LuFolderOpen />
										Import repo
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					</>
				) : (
					<>
						<Tabs
							value={currentTab}
							onValueChange={(value) => onTabChange(value as TabValue)}
						>
							<TabsList className="h-8 bg-transparent p-0 gap-1">
								{TABS.map((tab) => {
									const Icon = tab.Icon;
									return (
										<TabsTrigger
											key={tab.value}
											value={tab.value}
											className="h-8 rounded-md px-3 data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
										>
											<Icon className="h-3.5 w-3.5" />
											<span className="text-sm">{tab.label}</span>
										</TabsTrigger>
									);
								})}
							</TabsList>
						</Tabs>

						<div className="h-4 w-px bg-border" />

						<AssigneeFilter
							value={assigneeFilter}
							onChange={onAssigneeFilterChange}
						/>
					</>
				)}
			</div>

			{/* Search on the right */}
			<div className="relative w-64">
				<HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
				<Input
					ref={searchInputRef}
					type="text"
					placeholder="Search tasks..."
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
	);
}
