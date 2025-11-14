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
import { ArrowLeft, Loader2, Plus, Search, X } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Worktree } from "shared/types";
import { TerminalOutput } from "../Sidebar/components/CreateWorktreeModal/TerminalOutput";
import { Avatar } from "./Avatar";
import type { TaskStatus } from "./StatusIndicator";
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
		sourceBranch?: string;
		cloneTabsFromWorktreeId?: string;
	}) => void;
	initialMode?: "list" | "new";
	// Worktree creation props
	branches?: string[];
	worktrees?: Worktree[];
	isCreating?: boolean;
	setupStatus?: string;
	setupOutput?: string;
}

export const AddTaskModal: React.FC<AddTaskModalProps> = ({
	isOpen,
	onClose,
	tasks,
	openTasks,
	onSelectTask,
	onCreateTask,
	initialMode = "list",
	branches = [],
	worktrees = [],
	isCreating = false,
	setupStatus,
	setupOutput,
}) => {
	const [mode, setMode] = useState<"list" | "new">(initialMode);
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

	// New task form state
	const [newTaskName, setNewTaskName] = useState("");
	const [newTaskDescription, setNewTaskDescription] = useState("");
	const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>("planning");
	const [newTaskAssignee, setNewTaskAssignee] = useState("You");
	const [newTaskBranch, setNewTaskBranch] = useState("");
	const [sourceBranch, setSourceBranch] = useState("");
	const [cloneTabsFromWorktreeId, setCloneTabsFromWorktreeId] = useState("");

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

	// Track if branch name was manually edited
	const [isBranchManuallyEdited, setIsBranchManuallyEdited] = useState(false);

	// Generate branch name with collision avoidance (same logic as generateBranchName)
	const generateBranchNameWithCollisionAvoidance = useCallback(
		(title: string): string => {
			// Convert to lowercase and replace spaces/special chars with hyphens
			let slug = title
				.toLowerCase()
				.trim()
				.replace(/[\s_]+/g, "-")
				.replace(/[^a-z0-9-]/g, "")
				.replace(/-+/g, "-")
				.replace(/^-+|-+$/g, "");

			// If slug is empty after sanitization, use a default
			if (!slug) {
				slug = "worktree";
			}

			// Generate random suffix (4 chars) for collision avoidance
			const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
			let randomSuffix = "";
			for (let i = 0; i < 4; i++) {
				randomSuffix += chars.charAt(
					Math.floor(Math.random() * chars.length),
				);
			}

			// Calculate available length (max 50 chars, reserve 5 for "-" + suffix)
			const maxLength = 50;
			const availableLength = maxLength - 4 - 1; // 45 chars for base slug

			// Truncate slug if needed
			if (slug.length > availableLength) {
				const truncated = slug.substring(0, availableLength);
				const lastHyphen = truncated.lastIndexOf("-");

				if (lastHyphen > availableLength * 0.7) {
					slug = truncated.substring(0, lastHyphen);
				} else {
					slug = truncated;
				}

				slug = slug.replace(/-+$/, "");
			}

			return `${slug}-${randomSuffix}`;
		},
		[],
	);

	// Auto-generate branch name from task name (only if not manually edited)
	useEffect(() => {
		if (!isBranchManuallyEdited && newTaskName) {
			const branchName = generateBranchNameWithCollisionAvoidance(newTaskName);
			setNewTaskBranch(branchName);
		} else if (!newTaskName) {
			setNewTaskBranch("");
			setIsBranchManuallyEdited(false);
		}
	}, [newTaskName, isBranchManuallyEdited, generateBranchNameWithCollisionAvoidance]);

	// Initialize source branch when modal opens or branches change
	// Always try to default to "main" if available
	useEffect(() => {
		if (isOpen && mode === "new" && branches.length > 0) {
			// Prefer "main" branch, fallback to "master", then first branch
			const mainBranch = branches.find((b) => b.toLowerCase() === "main");
			const masterBranch = branches.find((b) => b.toLowerCase() === "master");
			const preferredBranch = mainBranch || masterBranch || branches[0];

			// Only update if sourceBranch is empty or not in the branches list
			// This ensures we default to "main" but don't override user selections
			if (!sourceBranch || !branches.includes(sourceBranch)) {
				setSourceBranch(preferredBranch);
			}
		}
	}, [isOpen, mode, branches, sourceBranch]);

	// Auto-select worktree to clone tabs from if it matches the source branch
	useEffect(() => {
		if (sourceBranch && worktrees.length > 0) {
			// Find worktree with matching branch
			const matchingWorktree = worktrees.find(
				(wt) => wt.branch === sourceBranch,
			);
			if (matchingWorktree) {
				setCloneTabsFromWorktreeId(matchingWorktree.id);
			} else {
				// Clear selection if no matching worktree
				setCloneTabsFromWorktreeId("");
			}
		} else {
			setCloneTabsFromWorktreeId("");
		}
	}, [sourceBranch, worktrees]);

	// Reset mode when modal opens/closes
	useEffect(() => {
		if (isOpen) {
			setMode(initialMode);
			// Reset sourceBranch when opening in new mode so it can be set to "main"
			if (initialMode === "new") {
				setSourceBranch("");
			}
		} else {
			setMode("list");
		}
	}, [isOpen, initialMode]);

	// Handle opening a task
	const handleOpenTask = useCallback(() => {
		if (selectedTask) {
			onSelectTask(selectedTask);
			onClose();
			// Reset state
			setSearchQuery("");
			setSelectedTaskId(null);
		}
	}, [selectedTask, onSelectTask, onClose]);

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
	}, [
		isOpen,
		filteredTasks,
		selectedTaskId,
		selectedTask,
		searchQuery,
		handleOpenTask,
	]);

	// Clear search
	const handleClearSearch = () => {
		setSearchQuery("");
	};

	// Handle creating a new task
	const handleCreateTask = (e: React.FormEvent) => {
		e.preventDefault();
		if (!newTaskName.trim() || isCreating) return;

		onCreateTask({
			name: newTaskName.trim(),
			description: newTaskDescription.trim(),
			status: newTaskStatus,
			assignee: newTaskAssignee,
			branch: newTaskBranch,
			sourceBranch: sourceBranch || undefined,
			cloneTabsFromWorktreeId: cloneTabsFromWorktreeId || undefined,
		});

		// Don't close modal immediately - let parent handle closing after creation completes
		// Reset form only if not creating (will be reset when modal closes)
		if (!isCreating) {
			setNewTaskName("");
			setNewTaskDescription("");
			setNewTaskStatus("planning");
			setNewTaskAssignee("You");
			setNewTaskBranch("");
			setIsBranchManuallyEdited(false);
			setSourceBranch("");
			setCloneTabsFromWorktreeId("");
			setMode("list");
		}
	};

	// Handle back to list
	const handleBackToList = () => {
		if (isCreating) return; // Prevent going back while creating
		setMode("list");
		// Reset form
		setNewTaskName("");
		setNewTaskDescription("");
		setNewTaskStatus("planning");
		setNewTaskAssignee("You");
		setNewTaskBranch("");
		setIsBranchManuallyEdited(false);
		setSourceBranch("");
		setCloneTabsFromWorktreeId("");
	};

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => !open && !isCreating && onClose()}
		>
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
							className="flex-1 flex flex-col min-h-0 overflow-hidden"
						>
							{/* Scrollable content area */}
							<ScrollArea className="flex-1 min-h-0">
								<div className="px-6 pt-6 space-y-4 pb-4">
									{/* Title section */}
									<div className="space-y-4">
										<div className="space-y-2">
											<Label htmlFor="task-name">Title</Label>
											<Input
												id="task-name"
												placeholder="My new feature"
												value={newTaskName}
												onChange={(e) => setNewTaskName(e.target.value)}
												autoFocus
												required
												disabled={isCreating}
											/>
										</div>
										<div className="space-y-2">
											<Label htmlFor="task-description">
												Description{" "}
												<span className="text-muted-foreground font-normal">
													(Optional)
												</span>
											</Label>
											<Textarea
												id="task-description"
												placeholder="What is the goal of this worktree?"
												value={newTaskDescription}
												onChange={(e) => setNewTaskDescription(e.target.value)}
												disabled={isCreating}
												rows={3}
												className="resize-none"
											/>
										</div>
									</div>

									{/* Setup Progress Section */}
									{isCreating && (
										<div className="flex flex-col space-y-3 min-h-[200px] pt-4">
											<div className="flex items-center gap-2 text-sm text-neutral-300">
												<Loader2 size={16} className="animate-spin" />
												<span>{setupStatus || "Creating worktree..."}</span>
											</div>

											{setupOutput && (
												<div className="bg-neutral-900 rounded border border-neutral-700 overflow-hidden min-h-[200px]">
													<TerminalOutput
														output={setupOutput}
														className="w-full h-full"
													/>
												</div>
											)}
										</div>
									)}

									{/* Error Display - shown when creation failed */}
									{!isCreating &&
										setupStatus &&
										(setupStatus.toLowerCase().includes("failed") ||
											setupStatus.toLowerCase().includes("error")) && (
											<div className="flex flex-col space-y-3 min-h-[200px] pt-4">
												<div className="flex items-center gap-2 text-sm text-red-400 font-medium">
													<span>{setupStatus}</span>
												</div>

												{setupOutput && (
													<div className="bg-red-500/10 rounded border border-red-500/30 p-3 overflow-auto min-h-[200px]">
														<pre className="text-red-200 text-xs font-mono whitespace-pre-wrap">
															{setupOutput}
														</pre>
													</div>
												)}
											</div>
										)}

									{/* Worktree creation options */}
									{(branches.length > 0 || worktrees.length > 0) && (
										<div className="space-y-3  pt-4">
											{branches.length > 0 && (
												<div className="space-y-2">
													<Label htmlFor="source-branch">
														Create From Branch
													</Label>
													<select
														id="source-branch"
														value={sourceBranch}
														onChange={(e) => setSourceBranch(e.target.value)}
														disabled={isCreating}
														className="flex h-9 w-full rounded-md border border-neutral-700 bg-neutral-900/50 px-3 py-1 text-sm text-neutral-200 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
													>
														{branches.map((branch) => (
															<option key={branch} value={branch}>
																{branch}
															</option>
														))}
													</select>
												</div>
											)}

											{worktrees.length > 0 && (
												<div className="space-y-2">
													<Label htmlFor="clone-tabs">
														Clone Tabs From
													</Label>
													<select
														id="clone-tabs"
														value={cloneTabsFromWorktreeId}
														onChange={(e) =>
															setCloneTabsFromWorktreeId(e.target.value)
														}
														disabled={isCreating}
														className="flex h-9 w-full rounded-md border border-neutral-700 bg-neutral-900/50 px-3 py-1 text-sm text-neutral-200 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
													>
														<option value="">Don't clone tabs</option>
														{worktrees.map((worktree) => (
															<option key={worktree.id} value={worktree.id}>
																{worktree.branch} ({worktree.tabs.length} tab
																{worktree.tabs.length !== 1 ? "s" : ""})
															</option>
														))}
													</select>
												</div>
											)}

											<div className="space-y-2">
												<Label htmlFor="branch-name">
													Branch Name
												</Label>
												<Input
													id="branch-name"
													type="text"
													placeholder="Auto-generated from title"
													value={newTaskBranch}
													onChange={(e) => {
														setNewTaskBranch(e.target.value);
														setIsBranchManuallyEdited(true);
													}}
													disabled={isCreating}
												/>
											</div>
										</div>
									)}

									{/* Metadata section */}
									<div className="flex items-center gap-3">
										{/* Status */}
										<Select
											value={newTaskStatus}
											onValueChange={(value) =>
												setNewTaskStatus(value as TaskStatus)
											}
											disabled={isCreating}
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
											disabled={isCreating}
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
									</div>
								</div>
							</ScrollArea>
							{/* Footer for new task form */}
							<div className="px-6 py-4 border-t border-neutral-800 flex items-center justify-between gap-2 shrink-0">
								<Button
									type="submit"
									disabled={!newTaskName.trim() || isCreating}
									className="ml-auto"
								>
									{isCreating ? "Creating..." : "Create task"}
								</Button>
							</div>
						</form>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
};
