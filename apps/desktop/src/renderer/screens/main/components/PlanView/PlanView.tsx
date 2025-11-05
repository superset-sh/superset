import {
	CheckCircle2,
	Circle,
	FileText,
	Paperclip,
	Plus,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import type { AttachedFile, LLMComplexity, SubTodo, Task } from "shared/types";

interface PlanViewProps {
	workspaceId?: string;
	worktreeId?: string;
}

const complexityConfig: Record<LLMComplexity, { label: string; color: string; dotColor: string; animated?: boolean }> = {
	"pending": {
		label: "Evaluating...",
		color: "text-neutral-400",
		dotColor: "bg-neutral-500",
		animated: true,
	},
	"one-shot": {
		label: "One-shot",
		color: "text-green-400",
		dotColor: "bg-green-500",
	},
	"needs-context": {
		label: "Needs context",
		color: "text-yellow-400",
		dotColor: "bg-yellow-500",
	},
	"needs-guidance": {
		label: "Needs guidance",
		color: "text-orange-400",
		dotColor: "bg-orange-500",
	},
	"low-confidence": {
		label: "Low confidence",
		color: "text-red-400",
		dotColor: "bg-red-500",
	},
};

export function PlanView({ workspaceId, worktreeId }: PlanViewProps) {
	const [tasks, setTasks] = useState<Task[]>([]);
	const [isLoadingTasks, setIsLoadingTasks] = useState(true);

	// Load tasks when workspace changes
	useEffect(() => {
		if (!workspaceId) return;

		const loadTasks = async () => {
			try {
				setIsLoadingTasks(true);
				const loadedTasks = await window.ipcRenderer.invoke("task-list", workspaceId);
				setTasks(loadedTasks);
			} catch (error) {
				console.error("Error loading tasks:", error);
			} finally {
				setIsLoadingTasks(false);
			}
		};

		loadTasks();
	}, [workspaceId]);

	// Task creation modal state
	const [isCreatingTask, setIsCreatingTask] = useState(false);
	const [newTaskStatus, setNewTaskStatus] = useState<Task["status"]>("todo");
	const [newTaskTitle, setNewTaskTitle] = useState("");
	const [newTaskDescription, setNewTaskDescription] = useState("");
	const [newTaskSubTodos, setNewTaskSubTodos] = useState<SubTodo[]>([]);
	const [newTaskSubTodoInput, setNewTaskSubTodoInput] = useState("");

	// Task detail modal state
	const [editingTask, setEditingTask] = useState<Task | null>(null);
	const [editTitle, setEditTitle] = useState("");
	const [editDescription, setEditDescription] = useState("");
	const [editComplexity, setEditComplexity] = useState<LLMComplexity | undefined>(undefined);
	const [newSubTodoTitle, setNewSubTodoTitle] = useState("");
	const [editingSubTodoId, setEditingSubTodoId] = useState<string | null>(null);
	const [editingSubTodoText, setEditingSubTodoText] = useState("");

	const columns: Array<{
		id: "todo" | "in-progress" | "done";
		title: string;
	}> = [
		{ id: "todo", title: "To Do" },
		{ id: "in-progress", title: "In Progress" },
		{ id: "done", title: "Done" },
	];

	const handleOpenCreateModal = (status: Task["status"]) => {
		setNewTaskStatus(status);
		setIsCreatingTask(true);
	};

	const handleCloseCreateModal = () => {
		setIsCreatingTask(false);
		setNewTaskTitle("");
		setNewTaskDescription("");
		setNewTaskSubTodos([]);
		setNewTaskSubTodoInput("");
	};

	const handleCreateTask = async () => {
		if (!newTaskTitle.trim() || !workspaceId) return;

		const taskToCreate: Omit<Task, "id" | "createdAt" | "updatedAt"> = {
			title: newTaskTitle.trim(),
			description: newTaskDescription.trim() || undefined,
			status: newTaskStatus,
			subTodos: newTaskSubTodos,
			files: [],
			llmComplexity: "pending",
		};

		// Create a temporary ID for optimistic UI update
		const tempId = `temp-${Date.now()}`;
		const tempTask: Task = {
			...taskToCreate,
			id: tempId,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		// Add to UI immediately with pending status
		setTasks([...tasks, tempTask]);
		handleCloseCreateModal();

		try {
			console.log("[PlanView] Creating task with complexity evaluation:", taskToCreate.title);
			
			// Create task via IPC - this will evaluate complexity automatically
			const result = await window.ipcRenderer.invoke("task-create", {
				workspaceId,
				task: taskToCreate,
				evaluateComplexity: true,
			});

			if (!result.success || !result.task) {
				console.error("[PlanView] Failed to create task:", result.error);
				// Remove the temp task on error
				setTasks(currentTasks => currentTasks.filter(t => t.id !== tempId));
				return;
			}

			console.log("[PlanView] Task created with complexity:", result.task.llmComplexity);

			// Replace temp task with real task (now with complexity)
			setTasks(currentTasks => 
				currentTasks.map(t => t.id === tempId ? result.task! : t)
			);
		} catch (error) {
			console.error("[PlanView] Error creating task:", error);
			// Remove the temp task on error
			setTasks(currentTasks => currentTasks.filter(t => t.id !== tempId));
		}
	};

	const handleAddSubTodoToNewTask = () => {
		if (!newTaskSubTodoInput.trim()) return;

		const newSubTodo: SubTodo = {
			id: `temp-${Date.now()}`,
			title: newTaskSubTodoInput.trim(),
			completed: false,
		};

		setNewTaskSubTodos([...newTaskSubTodos, newSubTodo]);
		setNewTaskSubTodoInput("");
	};

	const handleRemoveSubTodoFromNewTask = (subTodoId: string) => {
		setNewTaskSubTodos(newTaskSubTodos.filter((st) => st.id !== subTodoId));
	};

	const handleToggleNewTaskSubTodo = (subTodoId: string) => {
		setNewTaskSubTodos(
			newTaskSubTodos.map((st) =>
				st.id === subTodoId ? { ...st, completed: !st.completed } : st,
			),
		);
	};

	const handleMoveTask = async (taskId: string, newStatus: Task["status"]) => {
		if (!workspaceId) return;

		// Optimistically update UI
		setTasks(
			tasks.map((task) =>
				task.id === taskId ? { ...task, status: newStatus } : task,
			),
		);

		try {
			await window.ipcRenderer.invoke("task-update", {
				workspaceId,
				taskId,
				updates: { status: newStatus },
			});
		} catch (error) {
			console.error("Error moving task:", error);
			// Reload tasks on error
			const loadedTasks = await window.ipcRenderer.invoke("task-list", workspaceId);
			setTasks(loadedTasks);
		}
	};

	const handleDeleteTask = async (taskId: string) => {
		if (!workspaceId) return;

		// Optimistically update UI
		setTasks(tasks.filter((task) => task.id !== taskId));

		try {
			await window.ipcRenderer.invoke("task-delete", {
				workspaceId,
				taskId,
			});
		} catch (error) {
			console.error("Error deleting task:", error);
			// Reload tasks on error
			const loadedTasks = await window.ipcRenderer.invoke("task-list", workspaceId);
			setTasks(loadedTasks);
		}
	};

	const handleOpenTaskDetails = (task: Task) => {
		setEditingTask(task);
		setEditTitle(task.title);
		setEditDescription(task.description || "");
		setEditComplexity(task.llmComplexity);
	};

	const handleCloseTaskDetails = () => {
		setEditingTask(null);
		setNewSubTodoTitle("");
		setEditComplexity(undefined);
	};

	const handleSaveTask = async () => {
		if (!editingTask || !workspaceId) return;

		// Optimistically update UI
		const updatedTask = {
			...editingTask,
			title: editTitle,
			description: editDescription,
			llmComplexity: editComplexity,
		};
		
		setTasks(
			tasks.map((task) =>
				task.id === editingTask.id ? updatedTask : task,
			),
		);
		handleCloseTaskDetails();

		try {
			await window.ipcRenderer.invoke("task-update", {
				workspaceId,
				taskId: editingTask.id,
				updates: {
					title: editTitle,
					description: editDescription,
					llmComplexity: editComplexity,
				},
			});
		} catch (error) {
			console.error("Error saving task:", error);
			// Reload tasks on error
			const loadedTasks = await window.ipcRenderer.invoke("task-list", workspaceId);
			setTasks(loadedTasks);
		}
	};

	const handleAddSubTodo = async () => {
		if (!editingTask || !newSubTodoTitle.trim() || !workspaceId) return;

		const newSubTodo: SubTodo = {
			id: `${editingTask.id}-${Date.now()}`,
			title: newSubTodoTitle.trim(),
			completed: false,
		};

		const updatedSubTodos = [...editingTask.subTodos, newSubTodo];

		// Optimistically update UI
		setTasks(
			tasks.map((task) =>
				task.id === editingTask.id
					? { ...task, subTodos: updatedSubTodos }
					: task,
			),
		);

		setEditingTask({
			...editingTask,
			subTodos: updatedSubTodos,
		});
		setNewSubTodoTitle("");

		try {
			await window.ipcRenderer.invoke("task-update", {
				workspaceId,
				taskId: editingTask.id,
				updates: { subTodos: updatedSubTodos },
			});
		} catch (error) {
			console.error("Error adding sub-todo:", error);
		}
	};

	const handleToggleSubTodo = async (subTodoId: string) => {
		if (!editingTask || !workspaceId) return;

		const updatedSubTodos = editingTask.subTodos.map((st) =>
			st.id === subTodoId ? { ...st, completed: !st.completed } : st,
		);

		// Optimistically update UI
		setTasks(
			tasks.map((task) =>
				task.id === editingTask.id ? { ...task, subTodos: updatedSubTodos } : task,
			),
		);

		setEditingTask({ ...editingTask, subTodos: updatedSubTodos });

		try {
			await window.ipcRenderer.invoke("task-update", {
				workspaceId,
				taskId: editingTask.id,
				updates: { subTodos: updatedSubTodos },
			});
		} catch (error) {
			console.error("Error toggling sub-todo:", error);
		}
	};

	const handleDeleteSubTodo = async (subTodoId: string) => {
		if (!editingTask || !workspaceId) return;

		const updatedSubTodos = editingTask.subTodos.filter(
			(st) => st.id !== subTodoId,
		);

		// Optimistically update UI
		setTasks(
			tasks.map((task) =>
				task.id === editingTask.id ? { ...task, subTodos: updatedSubTodos } : task,
			),
		);

		setEditingTask({ ...editingTask, subTodos: updatedSubTodos });

		try {
			await window.ipcRenderer.invoke("task-update", {
				workspaceId,
				taskId: editingTask.id,
				updates: { subTodos: updatedSubTodos },
			});
		} catch (error) {
			console.error("Error deleting sub-todo:", error);
		}
	};

	const handleStartEditSubTodo = (subTodo: SubTodo) => {
		setEditingSubTodoId(subTodo.id);
		setEditingSubTodoText(subTodo.title);
	};

	const handleSaveSubTodoEdit = async () => {
		if (!editingTask || !editingSubTodoId || !editingSubTodoText.trim() || !workspaceId) return;

		const updatedSubTodos = editingTask.subTodos.map((st) =>
			st.id === editingSubTodoId
				? { ...st, title: editingSubTodoText.trim() }
				: st,
		);

		// Optimistically update UI
		setTasks(
			tasks.map((task) =>
				task.id === editingTask.id ? { ...task, subTodos: updatedSubTodos } : task,
			),
		);

		setEditingTask({ ...editingTask, subTodos: updatedSubTodos });
		setEditingSubTodoId(null);
		setEditingSubTodoText("");

		try {
			await window.ipcRenderer.invoke("task-update", {
				workspaceId,
				taskId: editingTask.id,
				updates: { subTodos: updatedSubTodos },
			});
		} catch (error) {
			console.error("Error saving sub-todo edit:", error);
		}
	};

	const handleCancelSubTodoEdit = () => {
		setEditingSubTodoId(null);
		setEditingSubTodoText("");
	};

	const handleAttachFile = async () => {
		if (!editingTask || !workspaceId) return;

		// Use Electron's dialog to select files
		const result = await window.ipcRenderer.invoke("dialog-open-file", {
			properties: ["openFile", "multiSelections"],
		});

		if (result.canceled || !result.filePaths.length) return;

		const newFiles: AttachedFile[] = result.filePaths.map((filePath: string) => {
			const fileName = filePath.split(/[\\/]/).pop() || filePath;
			return {
				id: `${editingTask.id}-file-${Date.now()}-${Math.random()}`,
				name: fileName,
				path: filePath,
				size: 0, // We could get actual file size via fs if needed
			};
		});

		const updatedFiles = [...editingTask.files, ...newFiles];

		// Optimistically update UI
		setTasks(
			tasks.map((task) =>
				task.id === editingTask.id
					? { ...task, files: updatedFiles }
					: task,
			),
		);

		setEditingTask({
			...editingTask,
			files: updatedFiles,
		});

		try {
			await window.ipcRenderer.invoke("task-update", {
				workspaceId,
				taskId: editingTask.id,
				updates: { files: updatedFiles },
			});
		} catch (error) {
			console.error("Error attaching file:", error);
		}
	};

	const handleRemoveFile = async (fileId: string) => {
		if (!editingTask || !workspaceId) return;

		const updatedFiles = editingTask.files.filter((f) => f.id !== fileId);

		// Optimistically update UI
		setTasks(
			tasks.map((task) =>
				task.id === editingTask.id ? { ...task, files: updatedFiles } : task,
			),
		);

		setEditingTask({ ...editingTask, files: updatedFiles });

		try {
			await window.ipcRenderer.invoke("task-update", {
				workspaceId,
				taskId: editingTask.id,
				updates: { files: updatedFiles },
			});
		} catch (error) {
			console.error("Error removing file:", error);
		}
	};

	const getTaskProgress = (task: Task) => {
		if (task.subTodos.length === 0) return null;
		const completed = task.subTodos.filter((st) => st.completed).length;
		return `${completed}/${task.subTodos.length}`;
	};

	if (!workspaceId) {
		return (
			<div className="h-full w-full bg-neutral-950 p-4 flex items-center justify-center">
				<div className="text-center">
					<h2 className="text-lg font-semibold text-neutral-100 mb-2">No Workspace Selected</h2>
					<p className="text-sm text-neutral-400">
						Select or create a workspace to manage tasks
					</p>
				</div>
			</div>
		);
	}

	if (isLoadingTasks) {
		return (
			<div className="h-full w-full bg-neutral-950 p-4 flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin w-8 h-8 border-4 border-neutral-700 border-t-blue-500 rounded-full mx-auto mb-4" />
					<p className="text-sm text-neutral-400">Loading tasks...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="h-full w-full bg-neutral-950 p-4 overflow-auto">
			<div className="mb-4">
				<h2 className="text-lg font-semibold text-neutral-100">Plan View</h2>
				<p className="text-sm text-neutral-400">
					Organize your tasks with a Kanban board
				</p>
			</div>

			<div className="grid grid-cols-3 gap-4 h-[calc(100%-80px)]">
				{columns.map((column) => (
					<div
						key={column.id}
						className="flex flex-col bg-neutral-900 rounded-lg p-3 border border-neutral-800"
					>
						<div className="flex items-center justify-between mb-3">
							<h3 className="text-sm font-semibold text-neutral-200 uppercase tracking-wide">
								{column.title}
							</h3>
							<button
								type="button"
								onClick={() => handleOpenCreateModal(column.id)}
								className="p-1 hover:bg-neutral-800 rounded transition-colors"
							>
								<Plus size={16} className="text-neutral-400" />
							</button>
						</div>

						{/* Tasks list */}
						<div className="flex-1 overflow-auto space-y-2">
							{tasks
								.filter((task) => task.status === column.id)
								.map((task) => (
									<div
										key={task.id}
										className="bg-neutral-800 rounded p-3 border border-neutral-700 hover:border-neutral-600 transition-colors group cursor-pointer"
										onClick={() => handleOpenTaskDetails(task)}
									>
										<div className="flex items-start justify-between mb-1">
											<div className="flex-1">
												<div className="flex items-center gap-2">
													<h4 className="text-sm font-medium text-neutral-100">
														{task.title}
													</h4>
													{task.llmComplexity && (
														<div className="flex items-center gap-1.5">
															<span
																className={`w-2 h-2 rounded-full ${complexityConfig[task.llmComplexity].dotColor} ${
																	complexityConfig[task.llmComplexity].animated ? "animate-pulse" : ""
																}`}
															/>
															<span
																className={`text-xs ${complexityConfig[task.llmComplexity].color}`}
															>
																{complexityConfig[task.llmComplexity].label}
															</span>
														</div>
													)}
												</div>
											</div>
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													handleDeleteTask(task.id);
												}}
												className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 transition-all text-xs"
											>
												×
											</button>
										</div>
										{task.description && (
											<p className="text-xs text-neutral-400 mb-2 line-clamp-2">
												{task.description}
											</p>
										)}

										{/* Task metadata */}
										<div className="flex items-center gap-2 text-xs text-neutral-500 mb-2">
											{task.subTodos.length > 0 && (
												<div className="flex items-center gap-1">
													<CheckCircle2 size={12} />
													<span>{getTaskProgress(task)}</span>
												</div>
											)}
											{task.files.length > 0 && (
												<div className="flex items-center gap-1">
													<Paperclip size={12} />
													<span>{task.files.length}</span>
												</div>
											)}
										</div>

										<div className="flex gap-1">
											{column.id !== "todo" && (
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														handleMoveTask(
															task.id,
															column.id === "in-progress" ? "todo" : "in-progress",
														);
													}}
													className="text-xs px-2 py-1 bg-neutral-700 hover:bg-neutral-600 rounded transition-colors text-neutral-300"
												>
													←
												</button>
											)}
											{column.id !== "done" && (
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														handleMoveTask(
															task.id,
															column.id === "todo" ? "in-progress" : "done",
														);
													}}
													className="text-xs px-2 py-1 bg-neutral-700 hover:bg-neutral-600 rounded transition-colors text-neutral-300"
												>
													→
												</button>
											)}
										</div>
									</div>
								))}
						</div>
					</div>
				))}
			</div>

			{/* Create Task Modal */}
			<Dialog open={isCreatingTask} onOpenChange={handleCloseCreateModal}>
				<DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Create New Task</DialogTitle>
					</DialogHeader>

					<div
						className="space-y-4 mt-4"
						onKeyDown={(e) => {
							if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
								e.preventDefault();
								handleCreateTask();
							}
						}}
					>
						{/* Title */}
						<div>
							<label className="text-sm font-medium text-neutral-200 mb-2 block">
								Title <span className="text-red-400">*</span>
							</label>
							<input
								type="text"
								value={newTaskTitle}
								onChange={(e) => setNewTaskTitle(e.target.value)}
								placeholder="What needs to be done?"
								className="w-full px-3 py-2 text-sm bg-neutral-800 border border-neutral-700 rounded text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
								autoFocus
							/>
						</div>

						{/* Description */}
						<div>
							<label className="text-sm font-medium text-neutral-200 mb-2 block">
								Description
							</label>
							<textarea
								value={newTaskDescription}
								onChange={(e) => setNewTaskDescription(e.target.value)}
								rows={3}
								placeholder="Add more details..."
								className="w-full px-3 py-2 text-sm bg-neutral-800 border border-neutral-700 rounded text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
							/>
						</div>

						{/* Sub-todos */}
						<div>
							<label className="text-sm font-medium text-neutral-200 mb-2 block">
								Sub-todos
							</label>
							<div className="space-y-2">
								{newTaskSubTodos.map((subTodo) => (
									<div
										key={subTodo.id}
										className="flex items-center gap-2 bg-neutral-800 rounded p-2 group"
									>
										<button
											type="button"
											onClick={() => handleToggleNewTaskSubTodo(subTodo.id)}
											className="flex-shrink-0"
										>
											{subTodo.completed ? (
												<CheckCircle2 size={16} className="text-green-500" />
											) : (
												<Circle size={16} className="text-neutral-500" />
											)}
										</button>
										<span
											className={`flex-1 text-sm ${
												subTodo.completed
													? "text-neutral-500 line-through"
													: "text-neutral-200"
											}`}
										>
											{subTodo.title}
										</span>
										<button
											type="button"
											onClick={() => handleRemoveSubTodoFromNewTask(subTodo.id)}
											className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 transition-all"
										>
											<X size={14} />
										</button>
									</div>
								))}

								{/* Add sub-todo input */}
								<div className="flex gap-2">
									<input
										type="text"
										value={newTaskSubTodoInput}
										onChange={(e) => setNewTaskSubTodoInput(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												handleAddSubTodoToNewTask();
											}
										}}
										placeholder="Add sub-todo..."
										className="flex-1 px-3 py-2 text-sm bg-neutral-800 border border-neutral-700 rounded text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
									/>
									<Button
										size="sm"
										onClick={handleAddSubTodoToNewTask}
										type="button"
									>
										<Plus size={14} />
									</Button>
								</div>
							</div>
						</div>

						{/* Status */}
						<div>
							<label className="text-sm font-medium text-neutral-200 mb-2 block">
								Status
							</label>
							<div className="flex gap-2">
								{columns.map((column) => (
									<button
										key={column.id}
										type="button"
										onClick={() => setNewTaskStatus(column.id)}
										className={`flex-1 px-3 py-2 rounded text-xs font-medium transition-colors ${
											newTaskStatus === column.id
												? "bg-blue-600 text-white"
												: "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
										}`}
									>
										{column.title}
									</button>
								))}
							</div>
						</div>

						{/* Actions */}
						<div className="flex justify-end gap-2 pt-4">
							<Button variant="ghost" onClick={handleCloseCreateModal} type="button">
								Cancel
							</Button>
							<Button
								onClick={handleCreateTask}
								disabled={!newTaskTitle.trim()}
								type="button"
							>
								Create Task
							</Button>
						</div>

						<p className="text-xs text-neutral-500 text-center">
							Press <kbd className="px-1 bg-neutral-800 rounded">⌘</kbd> +{" "}
							<kbd className="px-1 bg-neutral-800 rounded">Enter</kbd> to create
						</p>
					</div>
				</DialogContent>
			</Dialog>

			{/* Task Detail Modal */}
			<Dialog open={!!editingTask} onOpenChange={handleCloseTaskDetails}>
				<DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Edit Task</DialogTitle>
					</DialogHeader>

					<div className="space-y-4 mt-4">
						{/* Title */}
						<div>
							<label className="text-sm font-medium text-neutral-200 mb-2 block">
								Title
							</label>
							<input
								type="text"
								value={editTitle}
								onChange={(e) => setEditTitle(e.target.value)}
								className="w-full px-3 py-2 text-sm bg-neutral-800 border border-neutral-700 rounded text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
						</div>

						{/* Description */}
						<div>
							<label className="text-sm font-medium text-neutral-200 mb-2 block">
								Description
							</label>
							<textarea
								value={editDescription}
								onChange={(e) => setEditDescription(e.target.value)}
								rows={4}
								className="w-full px-3 py-2 text-sm bg-neutral-800 border border-neutral-700 rounded text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
								placeholder="Add a description..."
							/>
						</div>

						{/* LLM Complexity */}
						<div>
							<label className="text-sm font-medium text-neutral-200 mb-2 block">
								LLM Complexity
							</label>
							<p className="text-xs text-neutral-400 mb-2">
								How easily can an LLM complete this task?
							</p>
							<div className="grid grid-cols-2 gap-2">
								{(Object.keys(complexityConfig) as LLMComplexity[]).map((complexity) => (
									<button
										key={complexity}
										type="button"
										onClick={() => setEditComplexity(complexity)}
										className={`flex items-center gap-2 px-3 py-2 rounded text-xs font-medium transition-colors ${
											editComplexity === complexity
												? "bg-neutral-700 border-2 border-blue-500"
												: "bg-neutral-800 border-2 border-neutral-700 hover:bg-neutral-750"
										}`}
									>
										<span className={`w-2 h-2 rounded-full ${complexityConfig[complexity].dotColor}`} />
										<span className={editComplexity === complexity ? "text-neutral-100" : "text-neutral-300"}>
											{complexityConfig[complexity].label}
										</span>
									</button>
								))}
								{editComplexity && (
									<button
										type="button"
										onClick={() => setEditComplexity(undefined)}
										className="col-span-2 px-3 py-2 rounded text-xs text-neutral-400 hover:text-neutral-200 transition-colors border border-neutral-700 hover:border-neutral-600"
									>
										Clear rating
									</button>
								)}
							</div>
						</div>

						{/* Sub-todos */}
						<div>
							<label className="text-sm font-medium text-neutral-200 mb-2 block">
								Sub-todos
							</label>
							<div className="space-y-2">
								{editingTask?.subTodos.map((subTodo) => (
									<div
										key={subTodo.id}
										className="flex items-center gap-2 bg-neutral-800 rounded p-2 group"
									>
										<button
											type="button"
											onClick={() => handleToggleSubTodo(subTodo.id)}
											className="flex-shrink-0"
										>
											{subTodo.completed ? (
												<CheckCircle2 size={16} className="text-green-500" />
											) : (
												<Circle size={16} className="text-neutral-500" />
											)}
										</button>
										{editingSubTodoId === subTodo.id ? (
											<>
												<input
													type="text"
													value={editingSubTodoText}
													onChange={(e) => setEditingSubTodoText(e.target.value)}
													onKeyDown={(e) => {
														if (e.key === "Enter") {
															handleSaveSubTodoEdit();
														} else if (e.key === "Escape") {
															handleCancelSubTodoEdit();
														}
													}}
													className="flex-1 px-2 py-1 text-sm bg-neutral-700 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
													autoFocus
												/>
												<Button
													size="sm"
													onClick={handleSaveSubTodoEdit}
													className="h-6 px-2"
												>
													Save
												</Button>
												<Button
													size="sm"
													variant="ghost"
													onClick={handleCancelSubTodoEdit}
													className="h-6 px-2"
												>
													Cancel
												</Button>
											</>
										) : (
											<>
												<span
													className={`flex-1 text-sm cursor-pointer ${
														subTodo.completed
															? "text-neutral-500 line-through"
															: "text-neutral-200"
													}`}
													onClick={() => handleStartEditSubTodo(subTodo)}
												>
													{subTodo.title}
												</span>
												<button
													type="button"
													onClick={() => handleDeleteSubTodo(subTodo.id)}
													className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 transition-all"
												>
													<X size={14} />
												</button>
											</>
										)}
									</div>
								))}

								{/* Add sub-todo input */}
								<div className="flex gap-2">
									<input
										type="text"
										value={newSubTodoTitle}
										onChange={(e) => setNewSubTodoTitle(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												handleAddSubTodo();
											}
										}}
										placeholder="Add sub-todo..."
										className="flex-1 px-3 py-2 text-sm bg-neutral-800 border border-neutral-700 rounded text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
									/>
									<Button size="sm" onClick={handleAddSubTodo}>
										<Plus size={14} />
									</Button>
								</div>
							</div>
						</div>

						{/* Attached Files */}
						<div>
							<label className="text-sm font-medium text-neutral-200 mb-2 block">
								Attached Files
							</label>
							<div className="space-y-2">
								{editingTask?.files.map((file) => (
									<div
										key={file.id}
										className="flex items-center gap-2 bg-neutral-800 rounded p-2 group"
									>
										<FileText size={16} className="text-neutral-400 flex-shrink-0" />
										<span className="flex-1 text-sm text-neutral-200 truncate">
											{file.name}
										</span>
										<button
											type="button"
											onClick={() => handleRemoveFile(file.id)}
											className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 transition-all"
										>
											<X size={14} />
										</button>
									</div>
								))}

								{/* Attach file button */}
								<Button
									size="sm"
									variant="outline"
									onClick={handleAttachFile}
									className="w-full"
								>
									<Paperclip size={14} className="mr-2" />
									Attach File
								</Button>
							</div>
						</div>

						{/* Actions */}
						<div className="flex justify-end gap-2 pt-4">
							<Button variant="ghost" onClick={handleCloseTaskDetails}>
								Cancel
							</Button>
							<Button onClick={handleSaveTask}>Save Changes</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
