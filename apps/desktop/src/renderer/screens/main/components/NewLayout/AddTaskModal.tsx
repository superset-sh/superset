import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@superset/ui/resizable";
import { ScrollArea } from "@superset/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Textarea } from "@superset/ui/textarea";
import { ArrowLeft, Plus, Search, X } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "./Avatar";
import { StatusIndicator, type TaskStatus } from "./StatusIndicator";
import { TaskListItem } from "./TaskListItem";
import { TaskPreview } from "./TaskPreview";

interface Task {
	id: string;
	slug: string;
	name: string;
	status: TaskStatus;
	branch: string;
	description: string;
	assignee: string;
	assigneeAvatarUrl: string;
	lastUpdated: string;
}

interface AddTaskModalProps {
	isOpen: boolean;
	onClose: () => void;
	tasks: Task[];
	openTasks: Task[];
	onSelectTask: (task: Task) => void;
	onCreateTask: (taskData: {
		name: string;
		description: string;
		status: TaskStatus;
		assignee: string;
		branch: string;
	}) => void;
}

export const AddTaskModal: React.FC<AddTaskModalProps> = ({
	isOpen,
	onClose,
	tasks,
	openTasks,
	onSelectTask,
	onCreateTask,
}) => {
	const [mode, setMode] = useState<"list" | "new">("list");
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

	// New task form state
	const [newTaskName, setNewTaskName] = useState("");
	const [newTaskDescription, setNewTaskDescription] = useState("");
	const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>("planning");
	const [newTaskAssignee, setNewTaskAssignee] = useState("You");
	const [newTaskBranch, setNewTaskBranch] = useState("");

	// Filter tasks based on search query
	const filteredTasks = useMemo(() => {
		if (!searchQuery.trim()) return tasks;

		const query = searchQuery.toLowerCase();
		return tasks.filter(
			(task) =>
				task.slug.toLowerCase().includes(query) ||
				task.name.toLowerCase().includes(query) ||
				task.description.toLowerCase().includes(query) ||
				task.assignee.toLowerCase().includes(query),
		);
	}, [tasks, searchQuery]);

	// Select first task by default when filtered tasks change
	useEffect(() => {
		if (filteredTasks.length > 0 && !selectedTaskId) {
			setSelectedTaskId(filteredTasks[0].id);
		}
	}, [filteredTasks, selectedTaskId]);

	// Get currently selected task (from all tasks, not just filtered)
	const selectedTask = useMemo(
		() => tasks.find((task) => task.id === selectedTaskId) || null,
		[tasks, selectedTaskId],
	);

	// Check if selected task is already open
	const isSelectedTaskOpen = useMemo(
		() =>
			selectedTask ? openTasks.some((t) => t.id === selectedTask.id) : false,
		[selectedTask, openTasks],
	);

	// Auto-generate branch name from task name
	useEffect(() => {
		if (newTaskName) {
			const branchName = newTaskName
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-|-$/g, "");
			setNewTaskBranch(branchName);
		} else {
			setNewTaskBranch("");
		}
	}, [newTaskName]);

	// Reset mode when modal closes
	useEffect(() => {
		if (!isOpen) {
			setMode("list");
		}
	}, [isOpen]);

	// Handle keyboard navigation
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			// Arrow up/down navigation
			if (e.key === "ArrowDown" || e.key === "ArrowUp") {
				e.preventDefault();
				const currentIndex = filteredTasks.findIndex(
					(task) => task.id === selectedTaskId,
				);

				if (e.key === "ArrowDown" && currentIndex < filteredTasks.length - 1) {
					setSelectedTaskId(filteredTasks[currentIndex + 1].id);
				} else if (e.key === "ArrowUp" && currentIndex > 0) {
					setSelectedTaskId(filteredTasks[currentIndex - 1].id);
				}
			}

			// Enter to open task
			if (e.key === "Enter" && selectedTask) {
				handleOpenTask();
			}

			// Escape to close (handled by Dialog, but we'll clear search too)
			if (e.key === "Escape" && searchQuery) {
				e.stopPropagation(); // Prevent closing dialog
				setSearchQuery("");
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, filteredTasks, selectedTaskId, selectedTask, searchQuery]);

	// Handle opening a task
	const handleOpenTask = () => {
		if (selectedTask) {
			onSelectTask(selectedTask);
			onClose();
			// Reset state
			setSearchQuery("");
			setSelectedTaskId(null);
		}
	};

	// Clear search
	const handleClearSearch = () => {
		setSearchQuery("");
	};

	// Handle creating a new task
	const handleCreateTask = (e: React.FormEvent) => {
		e.preventDefault();
		if (!newTaskName.trim()) return;

		onCreateTask({
			name: newTaskName.trim(),
			description: newTaskDescription.trim(),
			status: newTaskStatus,
			assignee: newTaskAssignee,
			branch: newTaskBranch,
		});

		// Close modal and reset form
		onClose();

		// Reset form
		setNewTaskName("");
		setNewTaskDescription("");
		setNewTaskStatus("planning");
		setNewTaskAssignee("You");
		setNewTaskBranch("");
		setMode("list");
	};

	// Handle back to list
	const handleBackToList = () => {
		setMode("list");
		// Reset form
		setNewTaskName("");
		setNewTaskDescription("");
		setNewTaskStatus("planning");
		setNewTaskAssignee("You");
		setNewTaskBranch("");
	};

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="w-[90vw]! max-w-[1200px]! h-[85vh]! max-h-[800px]! p-0 gap-0 flex flex-col">
				{/* Header */}
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-neutral-800 shrink-0">
					<div className="flex items-center justify-between pr-8">
						<div className="flex items-center gap-2">
							{mode === "new" && (
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={handleBackToList}
								>
									<ArrowLeft size={18} />
								</Button>
							)}
							<DialogTitle className="text-xl">
								{mode === "list" ? "Open Task" : "New Task"}
							</DialogTitle>
						</div>
						{mode === "list" && (
							<Button
								variant="outline"
								size="sm"
								className="gap-2"
								onClick={() => setMode("new")}
							>
								<Plus size={16} />
								New task
							</Button>
						)}
					</div>
				</DialogHeader>

				{/* Content - switches between list and new task form */}
				{mode === "list" ? (
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
													onChange={(e) => setSearchQuery(e.target.value)}
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
												{filteredTasks.length === 0 ? (
													<div className="text-center text-neutral-500 text-sm py-8">
														No tasks found
													</div>
												) : (
													filteredTasks.map((task) => (
														<TaskListItem
															key={task.id}
															task={task}
															isSelected={task.id === selectedTaskId}
															isOpen={openTasks.some((t) => t.id === task.id)}
															onClick={() => setSelectedTaskId(task.id)}
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
								{filteredTasks.length} of {tasks.length} tasks
							</div>
							<div className="flex gap-2">
								<Button variant="ghost" onClick={onClose}>
									Cancel
								</Button>
								<Button onClick={handleOpenTask} disabled={!selectedTask}>
									{isSelectedTaskOpen ? "Switch to Task" : "Open Task"}
								</Button>
							</div>
						</div>
					</>
				) : (
					<>
						{/* New task form - Description-focused layout */}
						<form
							onSubmit={handleCreateTask}
							className="flex-1 flex flex-col min-h-0"
						>
							{/* Title section */}
							<div className="px-6 pt-6 pb-3 shrink-0">
								<Input
									id="task-name"
									placeholder="Task title"
									value={newTaskName}
									onChange={(e) => setNewTaskName(e.target.value)}
									autoFocus
									required
								/>
							</div>

							{/* Description section - takes up all available space */}
							<div className="flex-1 px-6 min-h-0">
								<Textarea
									id="task-description"
									placeholder="Add description..."
									value={newTaskDescription}
									onChange={(e) => setNewTaskDescription(e.target.value)}
									className="h-full resize-none"
								/>
							</div>

							{/* Metadata section - at bottom */}
							<div className="px-6 py-4 border-t border-neutral-700 shrink-0">
								<div className="flex items-center gap-3">
									{/* Status */}
									<Select
										value={newTaskStatus}
										onValueChange={(value) =>
											setNewTaskStatus(value as TaskStatus)
										}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="planning">Planning</SelectItem>
											<SelectItem value="needs-feedback">
												Needs Feedback
											</SelectItem>
											<SelectItem value="ready-to-merge">
												Ready to Merge
											</SelectItem>
										</SelectContent>
									</Select>

									{/* Assignee */}
									<Select
										value={newTaskAssignee}
										onValueChange={setNewTaskAssignee}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="You" className="px-3">
												<div className="flex items-center gap-2">
													<Avatar
														imageUrl="https://i.pravatar.cc/150?img=1"
														name="You"
														size={16}
													/>
													<span>You</span>
												</div>
											</SelectItem>
											<SelectSeparator />
											<SelectGroup>
												<SelectLabel>Agents</SelectLabel>
												<SelectItem value="Claude" className="px-3">
													<div className="flex items-center gap-2">
														<Avatar
															imageUrl="https://upload.wikimedia.org/wikipedia/commons/b/b0/Claude_AI_symbol.svg"
															name="Claude"
															size={16}
														/>
														<span>Claude</span>
													</div>
												</SelectItem>
											</SelectGroup>
										</SelectContent>
									</Select>

									{/* Branch Name */}
									<div className="ml-auto text-xs text-neutral-500 font-mono">
										{newTaskBranch || "task-name"}
									</div>
								</div>
							</div>
							{/* Footer for new task form */}
							<div className="px-6 py-4 border-t border-neutral-800 flex items-center justify-between gap-2 shrink-0">
								<Button
									type="button"
									variant="ghost"
									onClick={handleBackToList}
									className="gap-2"
								>
									<ArrowLeft size={16} />
									Back
								</Button>
								<Button type="submit" disabled={!newTaskName.trim()}>
									Create task
								</Button>
							</div>
						</form>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
};
