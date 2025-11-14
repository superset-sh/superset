import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { ArrowLeft, Plus } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CreatingView } from "./AddTaskModal/CreatingView";
import { TaskForm } from "./AddTaskModal/TaskForm";
import { TaskList } from "./AddTaskModal/TaskList";
import type { AddTaskModalProps } from "./AddTaskModal/types";
import { useTaskData } from "./AddTaskModal/useTaskData";
import { useTaskForm } from "./AddTaskModal/useTaskForm";

export const AddTaskModal: React.FC<AddTaskModalProps> = ({
	isOpen,
	onClose,
	openTasks,
	onSelectTask,
	onCreateTask,
	initialMode = "list",
	branches = [],
	worktrees = [],
	isCreating = false,
	setupStatus,
	setupOutput,
	onClearStatus,
	apiBaseUrl = "http://localhost:3000",
}) => {
	const [mode, setMode] = useState<"list" | "new">(initialMode);
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

	const { tasks, isLoadingTasks, tasksError } = useTaskData(
		isOpen,
		mode,
		apiBaseUrl,
	);

	const formState = useTaskForm(isOpen, mode, branches, worktrees);

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

	// Get currently selected task
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

	// Reset mode when modal opens/closes
	useEffect(() => {
		if (isOpen) {
			setMode(initialMode);
		} else {
			setMode("list");
		}
	}, [isOpen, initialMode]);

	// Automatically go back to list mode when creation completes
	useEffect(() => {
		if (!isCreating && setupStatus && mode === "new") {
			const timer = setTimeout(() => {
				setMode("list");
				onClearStatus?.();
			}, 1500);
			return () => clearTimeout(timer);
		}
	}, [isCreating, setupStatus, mode, onClearStatus]);

	// Handle opening a task
	const handleOpenTask = useCallback(() => {
		if (selectedTask) {
			onSelectTask(selectedTask);
			onClose();
			setSearchQuery("");
			setSelectedTaskId(null);
		}
	}, [selectedTask, onSelectTask, onClose]);

	// Handle keyboard navigation
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
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

			if (e.key === "Enter" && selectedTask) {
				handleOpenTask();
			}

			if (e.key === "Escape" && searchQuery) {
				e.stopPropagation();
				setSearchQuery("");
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		isOpen,
		filteredTasks,
		selectedTaskId,
		selectedTask,
		searchQuery,
		handleOpenTask,
	]);

	// Handle creating a new task
	const handleCreateTask = (e: React.FormEvent) => {
		e.preventDefault();
		if (!formState.newTaskName.trim() || isCreating) return;

		onCreateTask({
			name: formState.newTaskName.trim(),
			description: formState.newTaskDescription.trim(),
			status: formState.newTaskStatus,
			assignee: formState.newTaskAssignee,
			branch: formState.newTaskBranch,
			sourceBranch: formState.sourceBranch || undefined,
			cloneTabsFromWorktreeId: formState.cloneTabsFromWorktreeId || undefined,
		});
	};

	// Handle back to list
	const handleBackToList = () => {
		if (isCreating) return;
		setMode("list");
	};

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => !open && !isCreating && onClose()}
		>
			<DialogContent
				className="w-[90vw]! max-w-[1200px]! h-[85vh]! max-h-[800px]! p-0 gap-0 flex flex-col"
				showCloseButton={!isCreating}
			>
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
					<TaskList
						searchQuery={searchQuery}
						onSearchChange={setSearchQuery}
						tasks={tasks}
						filteredTasks={filteredTasks}
						isLoadingTasks={isLoadingTasks}
						tasksError={tasksError}
						selectedTaskId={selectedTaskId}
						onTaskSelect={setSelectedTaskId}
						openTasks={openTasks}
						selectedTask={selectedTask}
						onOpenTask={handleOpenTask}
						isSelectedTaskOpen={isSelectedTaskOpen}
						onClose={onClose}
					/>
				) : (
					<>
						{/* Show creating view when creating or when there's a status */}
						{(isCreating || setupStatus) ? (
							<CreatingView
								setupStatus={setupStatus}
								setupOutput={setupOutput}
								isCreating={isCreating}
								onClose={onClose}
							/>
						) : (
							<TaskForm
								newTaskName={formState.newTaskName}
								onTaskNameChange={formState.setNewTaskName}
								newTaskDescription={formState.newTaskDescription}
								onTaskDescriptionChange={formState.setNewTaskDescription}
								newTaskStatus={formState.newTaskStatus}
								onTaskStatusChange={formState.setNewTaskStatus}
								newTaskAssignee={formState.newTaskAssignee}
								onTaskAssigneeChange={formState.setNewTaskAssignee}
								newTaskBranch={formState.newTaskBranch}
								onTaskBranchChange={formState.setNewTaskBranch}
								sourceBranch={formState.sourceBranch}
								onSourceBranchChange={formState.setSourceBranch}
								cloneTabsFromWorktreeId={formState.cloneTabsFromWorktreeId}
								onCloneTabsFromWorktreeIdChange={formState.setCloneTabsFromWorktreeId}
								branches={branches}
								worktrees={worktrees}
								onSubmit={handleCreateTask}
							/>
						)}
					</>
				)}
			</DialogContent>
		</Dialog>
	);
};
