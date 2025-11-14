import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@superset/ui/resizable";
import { ScrollArea } from "@superset/ui/scroll-area";
import { Loader2, Search, X } from "lucide-react";
import type React from "react";
import type { Task } from "./types";
import { TaskListItem } from "../TaskListItem";
import { TaskPreview } from "../TaskPreview";

interface TaskListProps {
	searchQuery: string;
	onSearchChange: (query: string) => void;
	tasks: Task[];
	filteredTasks: Task[];
	isLoadingTasks: boolean;
	tasksError: string | null;
	selectedTaskId: string | null;
	onTaskSelect: (taskId: string) => void;
	openTasks: Task[];
	selectedTask: Task | null;
	onOpenTask: () => void;
	isSelectedTaskOpen: boolean;
	onClose: () => void;
}

export const TaskList: React.FC<TaskListProps> = ({
	searchQuery,
	onSearchChange,
	tasks,
	filteredTasks,
	isLoadingTasks,
	tasksError,
	selectedTaskId,
	onTaskSelect,
	openTasks,
	selectedTask,
	onOpenTask,
	isSelectedTaskOpen,
	onClose,
}) => {
	const handleClearSearch = () => {
		onSearchChange("");
	};

	return (
		<>
			{/* Two-column layout */}
			<div className="flex-1 overflow-hidden min-h-0">
				<ResizablePanelGroup direction="horizontal" className="h-full">
					{/* Left panel: Search + Task list */}
					<ResizablePanel defaultSize={40} minSize={30} maxSize={50}>
						<div className="flex flex-col h-full">
							{/* Search bar */}
							<div className="px-4 pt-4 pb-3 border-b border-neutral-800/50 shrink-0">
								<div className="relative">
									<Search
										size={16}
										className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
									/>
									<Input
										type="text"
										placeholder="Search tasks..."
										value={searchQuery}
										onChange={(e) => onSearchChange(e.target.value)}
										className="pl-9 pr-9 bg-neutral-900/50 border-neutral-700/50 focus-visible:border-neutral-600"
										autoFocus
									/>
									{searchQuery && (
										<Button
											variant="ghost"
											size="icon-sm"
											onClick={handleClearSearch}
											className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6"
										>
											<X size={14} />
										</Button>
									)}
								</div>
							</div>

							{/* Task list */}
							<ScrollArea className="flex-1 h-0">
								<div className="p-2 space-y-0.5">
									{isLoadingTasks ? (
										<div className="flex items-center justify-center py-8">
											<Loader2 size={20} className="animate-spin text-neutral-500" />
											<span className="ml-2 text-sm text-neutral-500">
												Loading tasks...
											</span>
										</div>
									) : tasksError ? (
										<div className="text-center text-red-400 text-sm py-8 px-4">
											<p className="font-medium mb-1">Failed to load tasks</p>
											<p className="text-xs text-neutral-500">{tasksError}</p>
										</div>
									) : filteredTasks.length === 0 ? (
										<div className="text-center text-neutral-500 text-sm py-8">
											{searchQuery ? "No tasks match your search" : "No tasks found"}
										</div>
									) : (
										filteredTasks.map((task) => (
											<TaskListItem
												key={task.id}
												task={task}
												isSelected={task.id === selectedTaskId}
												isOpen={openTasks.some((t) => t.id === task.id)}
												onClick={() => onTaskSelect(task.id)}
											/>
										))
									)}
								</div>
							</ScrollArea>
						</div>
					</ResizablePanel>

					<ResizableHandle className="w-px bg-neutral-800" />

					{/* Right panel: Task preview */}
					<ResizablePanel defaultSize={60} minSize={50}>
						<TaskPreview task={selectedTask} />
					</ResizablePanel>
				</ResizablePanelGroup>
			</div>

			{/* Footer */}
			<div className="px-6 py-4 border-t border-neutral-800 flex items-center justify-between shrink-0">
				<div className="text-sm text-neutral-500">
					{!isLoadingTasks && !tasksError
						? `${filteredTasks.length} of ${tasks.length} tasks`
						: ""}
				</div>
				<div className="flex gap-2">
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button onClick={onOpenTask} disabled={!selectedTask || isLoadingTasks}>
						{isSelectedTaskOpen ? "Switch to Task" : "Open Task"}
					</Button>
				</div>
			</div>
		</>
	);
};

