import { join } from "node:path";
import {
	type InsertWorkspace,
	type InsertWorktree,
	planTasks,
	plans,
	projects,
	workspaces,
	worktrees,
} from "@superset/local-db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { localDb } from "main/lib/local-db";
import {
	createWorktree,
	generateBranchName,
	getDefaultBranch,
	removeWorktree,
} from "lib/trpc/routers/workspaces/utils/git";
import { copySupersetConfigToWorktree } from "lib/trpc/routers/workspaces/utils/setup";
import {
	taskExecutionManager,
	type TaskExecutionOutput,
} from "./manager";

interface ExecutionJob {
	taskId: string;
	planId: string;
	projectId: string;
	task: {
		id: string;
		title: string;
		description: string | null;
	};
	cancelled: boolean;
	abortController: AbortController;
	worktreeCreated: boolean;
	worktreePath?: string;
	mainRepoPath?: string;
}

/**
 * Execute a task in a new worktree with Claude
 */
export async function executeTask(
	job: ExecutionJob,
	manager: typeof taskExecutionManager,
): Promise<void> {
	const { taskId, projectId, task, mainRepoPath } = job;

	if (!mainRepoPath) {
		manager.updateProgress(
			taskId,
			"failed",
			"No main repository path found for project",
		);
		return;
	}

	try {
		// Acquire project lock for git operations
		await manager.acquireProjectLock(projectId);

		if (manager.isCancelled(taskId)) {
			return;
		}

		// Step 1: Create worktree for the task
		manager.updateProgress(
			taskId,
			"creating_worktree",
			"Creating git worktree...",
		);

		const worktreeResult = await createTaskWorktree({
			taskId,
			projectId,
			taskTitle: task.title,
			mainRepoPath,
			manager,
		});

		if (!worktreeResult) {
			return;
		}

		const { worktreePath, worktreeId, workspaceId, branch } = worktreeResult;

		// Update task with worktree info
		localDb
			.update(planTasks)
			.set({
				worktreeId,
				workspaceId,
				executionStatus: "running",
				updatedAt: Date.now(),
			})
			.where(eq(planTasks.id, taskId))
			.run();

		manager.markWorktreeCreated(taskId, worktreePath, worktreeId, workspaceId);
		manager.releaseProjectLock(projectId);

		if (manager.isCancelled(taskId)) {
			await cleanupWorktree(mainRepoPath, worktreePath, manager, taskId);
			return;
		}

		// Step 2: Run Claude in the worktree
		manager.updateProgress(taskId, "running", "Running Claude...");

		const prompt = buildClaudePrompt(task);

		await runClaudeInWorktree({
			taskId,
			worktreePath,
			prompt,
			manager,
			abortSignal: job.abortController.signal,
		});

		if (manager.isCancelled(taskId)) {
			return;
		}

		// Step 3: Mark as completed
		manager.updateProgress(taskId, "completed", "Task completed successfully");

		localDb
			.update(planTasks)
			.set({
				status: "completed",
				executionStatus: "completed",
				updatedAt: Date.now(),
			})
			.where(eq(planTasks.id, taskId))
			.run();
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(`[task-execution] Task ${taskId} failed:`, errorMessage);

		manager.updateProgress(taskId, "failed", "Task failed", errorMessage);

		localDb
			.update(planTasks)
			.set({
				status: "failed",
				executionStatus: "failed",
				updatedAt: Date.now(),
			})
			.where(eq(planTasks.id, taskId))
			.run();

		// Cleanup worktree if created
		const worktreeInfo = manager.getWorktreeInfo(taskId);
		if (worktreeInfo.created && worktreeInfo.path && mainRepoPath) {
			await cleanupWorktree(mainRepoPath, worktreeInfo.path, manager, taskId);
		}
	} finally {
		manager.releaseProjectLock(projectId);
	}
}

interface CreateTaskWorktreeParams {
	taskId: string;
	projectId: string;
	taskTitle: string;
	mainRepoPath: string;
	manager: typeof taskExecutionManager;
}

interface WorktreeResult {
	worktreePath: string;
	worktreeId: string;
	workspaceId: string;
	branch: string;
}

/**
 * Create a worktree for a task
 */
async function createTaskWorktree({
	taskId,
	projectId,
	taskTitle,
	mainRepoPath,
	manager,
}: CreateTaskWorktreeParams): Promise<WorktreeResult | null> {
	try {
		// Get project info
		const project = localDb
			.select()
			.from(projects)
			.where(eq(projects.id, projectId))
			.get();

		if (!project) {
			manager.updateProgress(
				taskId,
				"failed",
				"Project not found",
				`Project ${projectId} does not exist`,
			);
			return null;
		}

		// Generate branch name from task title
		const baseBranch = await getDefaultBranch(mainRepoPath);
		const safeTitlePart = taskTitle
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.slice(0, 30)
			.replace(/^-+|-+$/g, "");
		const branchSuffix = generateBranchName().slice(-6);
		const branch = `plan/${safeTitlePart}-${branchSuffix}`;

		// Determine worktree path - use .worktrees directory next to the main repo
		const worktreesDir = join(mainRepoPath, "..", ".worktrees");
		const worktreePath = join(worktreesDir, branch.replace(/\//g, "-"));

		// Create worktree
		await createWorktree(mainRepoPath, branch, worktreePath, `origin/${baseBranch}`);

		// Copy superset config
		copySupersetConfigToWorktree(mainRepoPath, worktreePath);

		// Create worktree record in DB
		const worktreeId = nanoid();
		const worktreeRecord: InsertWorktree = {
			id: worktreeId,
			projectId,
			path: worktreePath,
			branch,
			baseBranch,
			gitStatus: {
				branch,
				needsRebase: false,
				lastRefreshed: Date.now(),
			},
		};
		localDb.insert(worktrees).values(worktreeRecord).run();

		// Get max tab order for workspaces
		const existingWorkspaces = localDb
			.select()
			.from(workspaces)
			.where(eq(workspaces.projectId, projectId))
			.all();
		const maxTabOrder = Math.max(0, ...existingWorkspaces.map((w) => w.tabOrder));

		// Create workspace record in DB
		const workspaceId = nanoid();
		const workspaceRecord: InsertWorkspace = {
			id: workspaceId,
			projectId,
			worktreeId,
			type: "worktree",
			branch,
			name: `Plan: ${taskTitle.slice(0, 50)}`,
			tabOrder: maxTabOrder + 1,
		};
		localDb.insert(workspaces).values(workspaceRecord).run();

		console.log(
			`[task-execution] Created worktree at ${worktreePath} for task ${taskId}`,
		);

		return {
			worktreePath,
			worktreeId,
			workspaceId,
			branch,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		manager.updateProgress(
			taskId,
			"failed",
			"Failed to create worktree",
			errorMessage,
		);
		return null;
	}
}

/**
 * Build the prompt for Claude based on task details
 */
function buildClaudePrompt(task: { title: string; description: string | null }): string {
	let prompt = `Task: ${task.title}\n\n`;

	if (task.description) {
		prompt += `Description:\n${task.description}\n\n`;
	}

	prompt += `Please complete this task. When you're done, commit your changes with a descriptive commit message.`;

	return prompt;
}

interface RunClaudeParams {
	taskId: string;
	worktreePath: string;
	prompt: string;
	manager: typeof taskExecutionManager;
	abortSignal: AbortSignal;
}

/**
 * Run Claude in a worktree
 */
async function runClaudeInWorktree({
	taskId,
	worktreePath,
	prompt,
	manager,
	abortSignal,
}: RunClaudeParams): Promise<void> {
	// Import execa dynamically
	const { execa } = await import("execa");

	const emitOutput = (
		type: TaskExecutionOutput["type"],
		content: string,
	): void => {
		manager.emitOutput({
			taskId,
			type,
			content,
			timestamp: Date.now(),
		});
	};

	try {
		emitOutput("progress", `Starting Claude in ${worktreePath}...`);
		emitOutput("progress", `Prompt: ${prompt}`);

		// Run Claude CLI in the worktree directory
		// Using --print mode for now - will switch to full streaming later
		const claudeProcess = execa("claude", ["-p", prompt], {
			cwd: worktreePath,
			signal: abortSignal,
			timeout: 10 * 60 * 1000, // 10 minute timeout
			reject: false, // Don't throw on non-zero exit
		});

		// Stream stdout
		claudeProcess.stdout?.on("data", (data: Buffer) => {
			const text = data.toString();
			emitOutput("output", text);
		});

		// Stream stderr
		claudeProcess.stderr?.on("data", (data: Buffer) => {
			const text = data.toString();
			emitOutput("error", text);
		});

		const result = await claudeProcess;

		if (abortSignal.aborted) {
			emitOutput("progress", "Task was cancelled");
			return;
		}

		if (result.exitCode !== 0) {
			const errorMsg = result.stderr || result.stdout || "Unknown error";
			throw new Error(`Claude exited with code ${result.exitCode}: ${errorMsg}`);
		}

		emitOutput("progress", "Claude completed successfully");
	} catch (error) {
		if (abortSignal.aborted) {
			emitOutput("progress", "Task was cancelled");
			return;
		}

		const errorMessage = error instanceof Error ? error.message : String(error);

		// Check if Claude CLI is not installed
		if (
			errorMessage.includes("ENOENT") ||
			errorMessage.includes("command not found")
		) {
			throw new Error(
				"Claude CLI is not installed. Please install it with: npm install -g @anthropic-ai/claude-code",
			);
		}

		throw error;
	}
}

/**
 * Clean up a worktree after failure or cancellation
 */
async function cleanupWorktree(
	mainRepoPath: string,
	worktreePath: string,
	manager: typeof taskExecutionManager,
	taskId: string,
): Promise<void> {
	try {
		await removeWorktree(mainRepoPath, worktreePath);
		console.log(
			`[task-execution] Cleaned up worktree at ${worktreePath} for task ${taskId}`,
		);
	} catch (error) {
		console.error(
			`[task-execution] Failed to cleanup worktree for task ${taskId}:`,
			error,
		);
	}
}
