import { ListTodo, Plus, CheckCircle2, Circle, Calendar } from "lucide-react";
import { Button } from "@superset/ui/button";
import { ScrollArea } from "@superset/ui/scroll-area";
import { useState } from "react";

interface Task {
	id: string;
	title: string;
	completed: boolean;
	createdAt: Date;
}

export function PlanView() {
	const [tasks, setTasks] = useState<Task[]>([
		{
			id: "1",
			title: "Example task - Click to toggle completion",
			completed: false,
			createdAt: new Date(),
		},
	]);
	const [newTaskTitle, setNewTaskTitle] = useState("");

	const addTask = () => {
		if (!newTaskTitle.trim()) return;

		const newTask: Task = {
			id: Date.now().toString(),
			title: newTaskTitle,
			completed: false,
			createdAt: new Date(),
		};

		setTasks([...tasks, newTask]);
		setNewTaskTitle("");
	};

	const toggleTask = (taskId: string) => {
		setTasks(
			tasks.map((task) =>
				task.id === taskId ? { ...task, completed: !task.completed } : task,
			),
		);
	};

	const deleteTask = (taskId: string) => {
		setTasks(tasks.filter((task) => task.id !== taskId));
	};

	const completedCount = tasks.filter((t) => t.completed).length;

	return (
		<div className="flex flex-col h-full bg-neutral-950">
			{/* Header */}
			<div className="flex items-center justify-between p-6 border-b border-neutral-800">
				<div className="flex items-center gap-3">
					<div className="p-2 bg-blue-600/20 rounded-lg">
						<ListTodo className="text-blue-400" size={24} />
					</div>
					<div>
						<h1 className="text-2xl font-semibold text-neutral-100">Plan</h1>
						<p className="text-sm text-neutral-400">
							{completedCount} of {tasks.length} tasks completed
						</p>
					</div>
				</div>
			</div>

			{/* Main Content */}
			<div className="flex-1 overflow-hidden">
				<ScrollArea className="h-full">
					<div className="p-6 space-y-6">
						{/* Add Task Section */}
						<div className="bg-neutral-900 rounded-lg border border-neutral-800 p-4">
							<div className="flex gap-2">
								<input
									type="text"
									placeholder="Add a new task..."
									value={newTaskTitle}
									onChange={(e) => setNewTaskTitle(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											addTask();
										}
									}}
									className="flex-1 bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
								/>
								<Button
									onClick={addTask}
									disabled={!newTaskTitle.trim()}
									className="bg-blue-600 hover:bg-blue-700"
								>
									<Plus size={16} className="mr-2" />
									Add Task
								</Button>
							</div>
						</div>

						{/* Tasks List */}
						<div className="space-y-2">
							{tasks.length === 0 ? (
								<div className="text-center py-12 text-neutral-500">
									<ListTodo size={48} className="mx-auto mb-4 opacity-50" />
									<p>No tasks yet. Add one to get started!</p>
								</div>
							) : (
								tasks.map((task) => (
									<div
										key={task.id}
										className="group bg-neutral-900 rounded-lg border border-neutral-800 p-4 hover:border-neutral-700 transition-colors"
									>
										<div className="flex items-start gap-3">
											<button
												type="button"
												onClick={() => toggleTask(task.id)}
												className="mt-0.5 text-neutral-400 hover:text-blue-400 transition-colors"
											>
												{task.completed ? (
													<CheckCircle2 size={20} className="text-blue-400" />
												) : (
													<Circle size={20} />
												)}
											</button>
											<div className="flex-1 min-w-0">
												<p
													className={`text-sm ${
														task.completed
															? "line-through text-neutral-500"
															: "text-neutral-200"
													}`}
												>
													{task.title}
												</p>
												<div className="flex items-center gap-2 mt-1 text-xs text-neutral-500">
													<Calendar size={12} />
													<span>
														{task.createdAt.toLocaleDateString("en-US", {
															month: "short",
															day: "numeric",
															year: "numeric",
														})}
													</span>
												</div>
											</div>
											<button
												type="button"
												onClick={() => deleteTask(task.id)}
												className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 transition-all text-xs px-2 py-1 rounded hover:bg-neutral-800"
											>
												Delete
											</button>
										</div>
									</div>
								))
							)}
						</div>
					</div>
				</ScrollArea>
			</div>
		</div>
	);
}

