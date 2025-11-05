import { randomUUID } from "node:crypto";
import { ipcMain } from "electron";
import type { Task } from "shared/types";
import workspaceManager from "./workspace-manager";

/**
 * Evaluates task complexity using an LLM via Anthropic or OpenRouter API
 */
async function evaluateTaskComplexity(input: {
	title: string;
	description?: string;
	subTodos?: Array<{ title: string }>;
}): Promise<"one-shot" | "needs-context" | "needs-guidance" | "low-confidence"> {
	console.log("[TaskIpcs] Evaluating task complexity:", input.title);

	const anthropicKey = process.env.ANTHROPIC_API_KEY;
	const openrouterKey = process.env.OPENROUTER_API_KEY;
	
	// Fallback to heuristic if no API key
	if (!anthropicKey && !openrouterKey) {
		console.warn("[TaskIpcs] No ANTHROPIC_API_KEY or OPENROUTER_API_KEY found, using heuristic evaluation");
		return evaluateWithHeuristic(input);
	}

	try {
		// Build task description
		let taskDescription = `Task: ${input.title}`;
		if (input.description) {
			taskDescription += `\nDescription: ${input.description}`;
		}
		if (input.subTodos && input.subTodos.length > 0) {
			taskDescription += `\nSub-tasks:\n${input.subTodos.map(st => `- ${st.title}`).join('\n')}`;
		}

		const systemPrompt = `You are an expert at evaluating the complexity of coding tasks for LLM assistants working on Superset - a Git worktree management and development environment desktop application.

**About Superset:**
Superset is an Electron-based desktop app built with React, TypeScript, and Tailwind CSS. It helps developers manage multiple Git worktrees simultaneously with features like:
- Git worktree creation and management
- Integrated terminal sessions (using node-pty)
- Port detection and proxy routing
- Task/project planning with Kanban boards
- Workspace and tab management with React Mosaic layouts

**Tech Stack:**
- Frontend: React 19, TypeScript, Tailwind CSS, Radix UI
- Backend: Electron, Node.js
- Terminal: xterm.js with node-pty
- State: IPC communication between main and renderer processes
- Storage: JSON config files in ~/.superset/

**Classify tasks into one of these categories:**

- "one-shot": Simple, clear tasks that can be completed in a single prompt without additional context (e.g., "Add a button", "Fix typo", "Update color", "Add loading spinner")

- "needs-context": Tasks that require understanding existing code structure but are straightforward once context is provided (e.g., "Add authentication", "Create a new component", "Implement file picker dialog", "Add keyboard shortcut")

- "needs-guidance": Complex tasks that benefit from iterative guidance and planning (e.g., "Refactor the architecture", "Implement terminal synchronization", "Add Git operations", "Build settings panel with multiple tabs")

- "low-confidence": Ambiguous or very complex tasks where an LLM might struggle even with context (e.g., "Fix all bugs", "Optimize everything", "Make it better", "Improve performance")

Respond with ONLY the category name, nothing else.`;

		let response: Response;

		// Prefer Anthropic API if available
		if (anthropicKey) {
			console.log("[TaskIpcs] Using Anthropic API");
			console.log("[TaskIpcs] Task description:", taskDescription);
			
			response = await fetch("https://api.anthropic.com/v1/messages", {
				method: "POST",
				headers: {
					"x-api-key": anthropicKey,
					"anthropic-version": "2023-06-01",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: "claude-3-5-sonnet-20241022",
					max_tokens: 50,
					temperature: 0.3,
					system: systemPrompt,
					messages: [
						{
							role: "user",
							content: taskDescription
						}
					]
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error("[TaskIpcs] Anthropic API error:", response.status, response.statusText, errorText);
				return evaluateWithHeuristic(input);
			}

			const data = await response.json();
			console.log("[TaskIpcs] Anthropic raw response:", JSON.stringify(data, null, 2));
			
			const result = data.content?.[0]?.text?.trim().toLowerCase();
			console.log("[TaskIpcs] Extracted result:", result);

			// Map response to complexity type
			if (result?.includes("one-shot")) {
				console.log("[TaskIpcs] Classified as: one-shot");
				return "one-shot";
			}
			if (result?.includes("needs-context")) {
				console.log("[TaskIpcs] Classified as: needs-context");
				return "needs-context";
			}
			if (result?.includes("needs-guidance")) {
				console.log("[TaskIpcs] Classified as: needs-guidance");
				return "needs-guidance";
			}
			if (result?.includes("low-confidence")) {
				console.log("[TaskIpcs] Classified as: low-confidence");
				return "low-confidence";
			}

			console.warn("[TaskIpcs] Unexpected Anthropic response, falling back to heuristic:", result);
			return evaluateWithHeuristic(input);
		} 
		
		// Fall back to OpenRouter if available
		if (openrouterKey) {
			console.log("[TaskIpcs] Using OpenRouter API");
			response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
				method: "POST",
				headers: {
					"Authorization": `Bearer ${openrouterKey}`,
					"Content-Type": "application/json",
					"HTTP-Referer": "https://github.com/superset/superset",
				},
				body: JSON.stringify({
					model: "anthropic/claude-3.5-sonnet",
					messages: [
						{
							role: "system",
							content: systemPrompt
						},
						{
							role: "user",
							content: taskDescription
						}
					],
					temperature: 0.3,
					max_tokens: 50,
				}),
			});

			if (!response.ok) {
				console.error("[TaskIpcs] OpenRouter API error:", response.statusText);
				return evaluateWithHeuristic(input);
			}

			const data = await response.json();
			const result = data.choices?.[0]?.message?.content?.trim().toLowerCase();

			// Map response to complexity type
			if (result?.includes("one-shot")) return "one-shot";
			if (result?.includes("needs-context")) return "needs-context";
			if (result?.includes("needs-guidance")) return "needs-guidance";
			if (result?.includes("low-confidence")) return "low-confidence";

			console.warn("[TaskIpcs] Unexpected OpenRouter response:", result);
			return evaluateWithHeuristic(input);
		}

		return evaluateWithHeuristic(input);
		
	} catch (error) {
		console.error("[TaskIpcs] Error calling LLM API:", error);
		return evaluateWithHeuristic(input);
	}
}

/**
 * Fallback heuristic-based evaluation when LLM is unavailable
 */
function evaluateWithHeuristic(input: {
	title: string;
	description?: string;
	subTodos?: Array<{ title: string }>;
}): "one-shot" | "needs-context" | "needs-guidance" | "low-confidence" {
	const hasDescription = !!input.description && input.description.length > 20;
	const subTodoCount = input.subTodos?.length || 0;
	const titleWords = input.title.split(/\s+/).length;

	// Simple classification heuristic
	if (subTodoCount === 0 && titleWords <= 3) {
		return "one-shot";
	}
	if (subTodoCount <= 2 && hasDescription) {
		return "needs-context";
	}
	if (subTodoCount > 2) {
		return "needs-guidance";
	}
	return "low-confidence";
}

/**
 * Register IPC handlers for task operations
 */
export function registerTaskIpcs(): void {
	// Evaluate task complexity
	ipcMain.handle(
		"task-evaluate-complexity",
		async (
			_event,
			input: {
				title: string;
				description?: string;
				subTodos?: Array<{ title: string }>;
			},
		) => {
			try {
				const complexity = await evaluateTaskComplexity(input);

				console.log(
					`[TaskIpcs] Evaluated task "${input.title}" as: ${complexity}`,
				);

				return {
					success: true,
					complexity,
				};
			} catch (error) {
				console.error("[TaskIpcs] Error evaluating task complexity:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		},
	);

	// List tasks for a workspace
	ipcMain.handle("task-list", async (_event, workspaceId: string) => {
		try {
			const workspace = await workspaceManager.getWorkspace(workspaceId);
			return workspace?.tasks || [];
		} catch (error) {
			console.error("[TaskIpcs] Error listing tasks:", error);
			return [];
		}
	});

	// Create a new task
	ipcMain.handle(
		"task-create",
		async (
			_event,
			input: {
				workspaceId: string;
				task: Omit<Task, "id" | "createdAt" | "updatedAt">;
				evaluateComplexity?: boolean;
			},
		) => {
			try {
				const workspace = await workspaceManager.getWorkspace(input.workspaceId);
				if (!workspace) {
					return {
						success: false,
						error: "Workspace not found",
					};
				}

				const now = new Date().toISOString();
				const newTask: Task = {
					...input.task,
					id: randomUUID(),
					createdAt: now,
					updatedAt: now,
				};

				if (!workspace.tasks) {
					workspace.tasks = [];
				}
				workspace.tasks.push(newTask);

				// Save immediately with pending status
				await workspaceManager.saveConfig();

				console.log(`[TaskIpcs] Created task: ${newTask.title}`);

				// Evaluate complexity if requested (happens after initial save)
				if (input.evaluateComplexity && newTask.llmComplexity === "pending") {
					console.log(`[TaskIpcs] Evaluating complexity for: ${newTask.title}`);
					
					try {
						const complexity = await evaluateTaskComplexity({
							title: newTask.title,
							description: newTask.description,
							subTodos: newTask.subTodos,
						});

						console.log(`[TaskIpcs] Evaluated complexity: ${complexity}`);

						// Update the task in the same workspace object
						const taskIndex = workspace.tasks.findIndex(t => t.id === newTask.id);
						if (taskIndex !== -1) {
							workspace.tasks[taskIndex].llmComplexity = complexity;
							workspace.tasks[taskIndex].updatedAt = new Date().toISOString();
							newTask.llmComplexity = complexity;
							newTask.updatedAt = workspace.tasks[taskIndex].updatedAt;

							// Save again with the complexity
							await workspaceManager.saveConfig();
							console.log(`[TaskIpcs] Saved task with complexity: ${complexity}`);
						}
					} catch (error) {
						console.error("[TaskIpcs] Error evaluating complexity:", error);
						// Remove pending status on error
						const taskIndex = workspace.tasks.findIndex(t => t.id === newTask.id);
						if (taskIndex !== -1) {
							workspace.tasks[taskIndex].llmComplexity = undefined;
							newTask.llmComplexity = undefined;
							await workspaceManager.saveConfig();
						}
					}
				}

				return {
					success: true,
					task: newTask,
				};
			} catch (error) {
				console.error("[TaskIpcs] Error creating task:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		},
	);

	// Update a task
	ipcMain.handle(
		"task-update",
		async (
			_event,
			input: {
				workspaceId: string;
				taskId: string;
				updates: Partial<Omit<Task, "id" | "createdAt">>;
			},
		) => {
			try {
				const workspace = await workspaceManager.getWorkspace(input.workspaceId);
				if (!workspace) {
					return {
						success: false,
						error: "Workspace not found",
					};
				}

				if (!workspace.tasks) {
					return {
						success: false,
						error: "Task not found",
					};
				}

				const taskIndex = workspace.tasks.findIndex(t => t.id === input.taskId);
				if (taskIndex === -1) {
					return {
						success: false,
						error: "Task not found",
					};
				}

				const updatedTask: Task = {
					...workspace.tasks[taskIndex],
					...input.updates,
					updatedAt: new Date().toISOString(),
				};

				workspace.tasks[taskIndex] = updatedTask;
				await workspaceManager.saveConfig();

				console.log(`[TaskIpcs] Updated task: ${updatedTask.title}`);

				return {
					success: true,
					task: updatedTask,
				};
			} catch (error) {
				console.error("[TaskIpcs] Error updating task:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		},
	);

	// Delete a task
	ipcMain.handle(
		"task-delete",
		async (
			_event,
			input: {
				workspaceId: string;
				taskId: string;
			},
		) => {
			try {
				const workspace = await workspaceManager.getWorkspace(input.workspaceId);
				if (!workspace) {
					return {
						success: false,
						error: "Workspace not found",
					};
				}

				if (!workspace.tasks) {
					return {
						success: false,
						error: "Task not found",
					};
				}

				const taskIndex = workspace.tasks.findIndex(t => t.id === input.taskId);
				if (taskIndex === -1) {
					return {
						success: false,
						error: "Task not found",
					};
				}

				const deletedTask = workspace.tasks[taskIndex];
				workspace.tasks.splice(taskIndex, 1);
				await workspaceManager.saveConfig();

				console.log(`[TaskIpcs] Deleted task: ${deletedTask.title}`);

				return {
					success: true,
				};
			} catch (error) {
				console.error("[TaskIpcs] Error deleting task:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		},
	);

	console.log("[TaskIpcs] Registered task-related IPC handlers");
}
