import type { RouterOutputs } from "@superset/api";
import { ChevronDown, ChevronLeft, Play, User as UserIcon } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { Tab, Workspace } from "shared/types";

type Task = RouterOutputs["task"]["all"][number];
type User = RouterOutputs["user"]["all"][number];

interface TaskPageProps {
	task: Task;
	users: User[];
	onBack: () => void;
	onUpdate: (
		taskId: string,
		updates: {
			title: string;
			description: string;
			status: Task["status"];
			assigneeId?: string | null;
		},
	) => void;
	currentWorkspace: Workspace | null;
	selectedWorktreeId: string | null;
	onTabSelect: (worktreeId: string, tabId: string) => void;
	onTabCreated: (worktreeId: string, tab: Tab) => void;
}

const statusColors: Record<string, string> = {
	backlog: "bg-neutral-500",
	todo: "bg-blue-500",
	planning: "bg-yellow-500",
	working: "bg-amber-500",
	"needs-feedback": "bg-orange-500",
	"ready-to-merge": "bg-emerald-500",
	completed: "bg-green-600",
	canceled: "bg-red-500",
};

const statusLabels: Record<string, string> = {
	backlog: "Backlog",
	todo: "Todo",
	planning: "Pending",
	working: "Working",
	"needs-feedback": "Needs Feedback",
	"ready-to-merge": "Ready to Merge",
	completed: "Completed",
	canceled: "Canceled",
};

export const TaskPage: React.FC<TaskPageProps> = ({
	task,
	users,
	onBack,
	onUpdate,
	currentWorkspace,
	selectedWorktreeId,
	onTabSelect,
	onTabCreated,
}) => {
	const statusColor = statusColors[task.status] || "bg-neutral-500";
	const [title, setTitle] = useState(task.title);
	const [description, setDescription] = useState(task.description || "");
	const [status, setStatus] = useState(task.status);
	const [assigneeId, setAssigneeId] = useState<string | null>(task.assigneeId);
	const [isAssigneeDropdownOpen, setIsAssigneeDropdownOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Update local state when task changes
	useEffect(() => {
		setTitle(task.title);
		setDescription(task.description || "");
		setStatus(task.status);
		setAssigneeId(task.assigneeId);
	}, [task]);

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setIsAssigneeDropdownOpen(false);
			}
		};

		if (isAssigneeDropdownOpen) {
			document.addEventListener("mousedown", handleClickOutside);
		}

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isAssigneeDropdownOpen]);

	const handleTitleBlur = () => {
		if (title.trim() && title !== task.title) {
			onUpdate(task.id, { title: title.trim(), description, status });
		}
	};

	const handleDescriptionBlur = () => {
		if (description !== (task.description || "")) {
			onUpdate(task.id, { title, description: description.trim(), status });
		}
	};

	const handleStatusChange = (newStatus: Task["status"]) => {
		setStatus(newStatus);
		onUpdate(task.id, { title, description, status: newStatus });
	};

	const handleAssigneeChange = (newAssigneeId: string | null) => {
		setAssigneeId(newAssigneeId);
		setIsAssigneeDropdownOpen(false);
		onUpdate(task.id, {
			title,
			description,
			status,
			assigneeId: newAssigneeId,
		});
	};

	const selectedUser = assigneeId
		? users.find((u) => u.id === assigneeId)
		: null;

	const handleStartTask = async () => {
		if (!currentWorkspace) {
			console.error("No workspace selected");
			return;
		}

		// Find worktree to use: either the selected one, task's branch worktree, or first worktree
		let targetWorktreeId = selectedWorktreeId;

		if (!targetWorktreeId) {
			// Try to find a worktree matching the task's branch
			const taskWorktree = currentWorkspace.worktrees?.find(
				(wt) => wt.branch === task.branch,
			);

			if (taskWorktree) {
				targetWorktreeId = taskWorktree.id;
			} else if (
				currentWorkspace.worktrees &&
				currentWorkspace.worktrees.length > 0
			) {
				// Use the first worktree as fallback
				targetWorktreeId = currentWorkspace.worktrees[0].id;
			}
		}

		if (!targetWorktreeId) {
			console.error("No worktree available to create terminal");
			return;
		}

		try {
			// Create a new terminal with claude command
			const result = await window.ipcRenderer.invoke("tab-create", {
				workspaceId: currentWorkspace.id,
				worktreeId: targetWorktreeId,
				name: `Task: ${task.slug}`,
				type: "terminal",
				command: `claude "hi"`,
			});

			if (result.success) {
				// Update task status to planning (pending)
				onUpdate(task.id, {
					title: task.title,
					description: task.description || "",
					status: "planning",
				});

				// Reload workspace to get updated tab data
				await onTabCreated();

				// Select the new tab after reload
				const newTabId = result.tab?.id;
				if (newTabId) {
					// Small delay to ensure workspace is reloaded
					setTimeout(() => {
						onTabSelect(targetWorktreeId, newTabId);
					}, 100);
				}
			}
		} catch (error) {
			console.error("Error starting task:", error);
		}
	};

	return (
		<div className="flex flex-col h-full bg-neutral-950">
			{/* Header with Breadcrumbs */}
			<div className="border-b border-neutral-800/50 bg-neutral-950/80 backdrop-blur-sm">
				<div className="flex items-center justify-between gap-3 px-8 py-4">
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={onBack}
							className="flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors group"
						>
							<ChevronLeft
								size={16}
								className="group-hover:-translate-x-0.5 transition-transform"
							/>
							<span className="font-medium">Plan</span>
						</button>
						<span className="text-neutral-600">/</span>
						<span className="text-sm text-neutral-300 font-medium">
							{task.slug}
						</span>
					</div>
					<button
						type="button"
						onClick={handleStartTask}
						className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
					>
						<Play size={14} className="fill-white" />
						<span>Start Task</span>
					</button>
				</div>
			</div>

			{/* Main Content */}
			<div className="flex-1 overflow-hidden">
				<div className="flex h-full">
					{/* Left Content Area */}
					<div className="flex-1 overflow-y-auto">
						<div className="max-w-4xl mx-auto p-8">
							{/* Task Header */}
							<div className="mb-8">
								<div className="flex items-center gap-3 mb-4">
									<span className="text-sm font-semibold text-neutral-500 tracking-wide">
										{task.slug}
									</span>
									<div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-neutral-800/50 text-neutral-400 border border-neutral-800">
										<div
											className={`w-1.5 h-1.5 rounded-full ${statusColor} shadow-sm`}
										/>
										<span className="font-medium">
											{statusLabels[status] || status}
										</span>
									</div>
								</div>

								{/* Editable Title */}
								<input
									type="text"
									value={title}
									onChange={(e) => setTitle(e.target.value)}
									onBlur={handleTitleBlur}
									className="w-full text-2xl font-semibold text-white leading-tight mb-6 bg-transparent border-none outline-none focus:outline-none px-0 placeholder:text-neutral-600"
									placeholder="Task title..."
								/>

								{/* Editable Description Section */}
								<div className="bg-neutral-900/30 border border-neutral-800/50 rounded-xl p-6">
									<h2 className="text-sm font-semibold text-neutral-400 mb-3">
										Description
									</h2>
									<textarea
										value={description}
										onChange={(e) => setDescription(e.target.value)}
										onBlur={handleDescriptionBlur}
										className="w-full min-h-[100px] text-sm text-neutral-300 leading-relaxed bg-transparent border-none outline-none focus:outline-none resize-none placeholder:text-neutral-600"
										placeholder="Add a description..."
									/>
								</div>
							</div>

							{/* Activity/Comments Section (Placeholder) */}
							<div className="border-t border-neutral-800/50 pt-8">
								<h2 className="text-sm font-semibold text-neutral-400 mb-4">
									Activity
								</h2>
								<div className="bg-neutral-900/20 border border-neutral-800/30 rounded-xl p-8 text-center">
									<p className="text-sm text-neutral-500">
										Agent activity and comments will appear here
									</p>
								</div>
							</div>
						</div>
					</div>

					{/* Right Sidebar - Properties */}
					<div className="w-80 border-l border-neutral-800/50 bg-neutral-950/50 backdrop-blur-sm overflow-y-auto">
						<div className="p-6 space-y-6">
							<h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">
								Properties
							</h2>

							{/* Status - Editable Dropdown */}
							<div>
								<label
									htmlFor="status-select"
									className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 block"
								>
									Status
								</label>
								<select
									id="status-select"
									value={status}
									onChange={(e) =>
										handleStatusChange(e.target.value as Task["status"])
									}
									className="w-full bg-neutral-900/50 border border-neutral-800/50 rounded-lg px-3 py-2 text-sm text-neutral-300 font-medium focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600/50 transition-all cursor-pointer"
								>
									<option value="backlog">Backlog</option>
									<option value="todo">Todo</option>
									<option value="planning">Pending</option>
									<option value="working">Working</option>
									<option value="needs-feedback">Needs Feedback</option>
									<option value="ready-to-merge">Ready to Merge</option>
									<option value="completed">Completed</option>
									<option value="canceled">Canceled</option>
								</select>
							</div>

							{/* Assignee - Editable Dropdown */}
							<div className="relative" ref={dropdownRef}>
								<label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 block">
									Assignee
								</label>
								<button
									type="button"
									onClick={() =>
										setIsAssigneeDropdownOpen(!isAssigneeDropdownOpen)
									}
									className="w-full bg-neutral-900/50 border border-neutral-800/50 rounded-lg px-3 py-2 text-sm text-neutral-300 font-medium hover:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600/50 transition-all cursor-pointer flex items-center justify-between h-9"
								>
									<div className="flex items-center gap-2">
										{selectedUser ? (
											<>
												<img
													src={
														selectedUser.avatarUrl ||
														"https://via.placeholder.com/24"
													}
													alt={selectedUser.name}
													className="w-5 h-5 rounded-full ring-1 ring-neutral-700"
												/>
												<span>{selectedUser.name}</span>
											</>
										) : (
											<>
												<div className="w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center">
													<UserIcon className="w-3 h-3" />
												</div>
												<span className="text-neutral-500">Unassigned</span>
											</>
										)}
									</div>
									<ChevronDown
										className={`w-4 h-4 text-neutral-500 transition-transform ${
											isAssigneeDropdownOpen ? "rotate-180" : ""
										}`}
									/>
								</button>

								{isAssigneeDropdownOpen && (
									<div className="absolute top-full left-0 right-0 mt-1 bg-neutral-900 border border-neutral-800 rounded-lg shadow-lg z-50 overflow-hidden">
										<div className="py-1 max-h-64 overflow-y-auto">
											<button
												type="button"
												onClick={() => handleAssigneeChange(null)}
												className="w-full px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 focus:bg-neutral-800 flex items-center gap-2 transition-colors cursor-pointer text-left"
											>
												<div className="w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center">
													<UserIcon className="w-3 h-3" />
												</div>
												<span>Unassigned</span>
											</button>
											{users.map((user) => (
												<button
													type="button"
													key={user.id}
													onClick={() => handleAssigneeChange(user.id)}
													className="w-full px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 focus:bg-neutral-800 flex items-center gap-2 transition-colors cursor-pointer text-left"
												>
													<img
														src={
															user.avatarUrl || "https://via.placeholder.com/24"
														}
														alt={user.name}
														className="w-5 h-5 rounded-full ring-1 ring-neutral-700"
													/>
													<span>{user.name}</span>
												</button>
											))}
										</div>
									</div>
								)}
							</div>

							{/* Creator */}
							{task.creator && (
								<div>
									<label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 block">
										Created by
									</label>
									<div className="flex items-center gap-3 px-3 py-2 bg-neutral-900/50 border border-neutral-800/50 rounded-lg">
										<img
											src={
												task.creator.avatarUrl ||
												"https://via.placeholder.com/32"
											}
											alt={task.creator.name}
											className="w-6 h-6 rounded-full ring-2 ring-neutral-800"
										/>
										<span className="text-sm text-neutral-300 font-medium">
											{task.creator.name}
										</span>
									</div>
								</div>
							)}

							{/* Branch */}
							{task.branch && (
								<div>
									<label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 block">
										Branch
									</label>
									<code className="block text-xs text-neutral-300 bg-neutral-900/50 border border-neutral-800/50 px-3 py-2 rounded-lg font-mono">
										{task.branch}
									</code>
								</div>
							)}

							{/* Created Date */}
							<div>
								<label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 block">
									Created
								</label>
								<div className="text-sm text-neutral-400">
									{new Date(task.createdAt).toLocaleDateString("en-US", {
										month: "short",
										day: "numeric",
										year: "numeric",
									})}
								</div>
							</div>

							{/* Updated Date */}
							<div>
								<label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 block">
									Updated
								</label>
								<div className="text-sm text-neutral-400">
									{new Date(task.updatedAt).toLocaleDateString("en-US", {
										month: "short",
										day: "numeric",
										year: "numeric",
									})}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};
