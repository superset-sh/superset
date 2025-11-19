import { randomUUID } from "node:crypto";

import type {
	CreateWorkspaceInput,
	Tab,
	UpdateWorkspaceInput,
	Workspace,
} from "shared/types";

import configManager from "../config-manager";
import { portDetector } from "../port-detector";
import { proxyManager } from "../proxy-manager";
import terminalManager from "../terminal";
import worktreeManager from "../worktree-manager";

/**
 * Get all workspaces
 */
export function listWorkspaces(): Workspace[] {
	const config = configManager.read();
	return config.workspaces;
}

/**
 * Get a workspace by ID
 */
export function getWorkspace(id: string): Workspace | null {
	const config = configManager.read();
	return config.workspaces.find((ws) => ws.id === id) || null;
}

/**
 * Create a new workspace (container for worktrees)
 */
export async function createWorkspace(
	input: CreateWorkspaceInput,
): Promise<{ success: boolean; workspace?: Workspace; error?: string }> {
	try {
		// Validate that repoPath is a git repository
		if (!worktreeManager.isGitRepo(input.repoPath)) {
			return {
				success: false,
				error: "The specified path is not a git repository",
			};
		}

		// Create workspace object - starts with no worktrees
		const now = new Date().toISOString();
		const workspace: Workspace = {
			id: randomUUID(),
			name: input.name,
			repoPath: input.repoPath,
			branch: input.branch,
			worktrees: [],
			activeWorktreeId: null,
			activeTabId: null,
			createdAt: now,
			updatedAt: now,
		};

		// Save to config
		const config = configManager.read();
		config.workspaces.push(workspace);
		const saved = configManager.write(config);

		if (!saved) {
			return {
				success: false,
				error: "Failed to save workspace configuration",
			};
		}

		// Set as active workspace
		configManager.setActiveWorkspaceId(workspace.id);

		return {
			success: true,
			workspace,
		};
	} catch (error) {
		console.error("Failed to create workspace:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Get the active workspace
 */
export function getLastOpenedWorkspace(): Workspace | null {
	const activeId = configManager.getActiveWorkspaceId();
	if (!activeId) return null;
	return getWorkspace(activeId);
}

/**
 * Update a workspace
 */
export async function updateWorkspace(
	input: UpdateWorkspaceInput,
): Promise<{ success: boolean; workspace?: Workspace; error?: string }> {
	try {
		const config = configManager.read();
		const index = config.workspaces.findIndex((ws) => ws.id === input.id);

		if (index === -1) {
			return {
				success: false,
				error: "Workspace not found",
			};
		}

		// Update workspace
		const workspace = config.workspaces[index];
		if (input.name) workspace.name = input.name;
		workspace.updatedAt = new Date().toISOString();

		config.workspaces[index] = workspace;
		const saved = configManager.write(config);

		if (!saved) {
			return {
				success: false,
				error: "Failed to save workspace configuration",
			};
		}

		return {
			success: true,
			workspace,
		};
	} catch (error) {
		console.error("Failed to update workspace:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Delete a workspace
 */
export async function deleteWorkspace(
	id: string,
	removeWorktree = false,
): Promise<{ success: boolean; error?: string }> {
	try {
		const config = configManager.read();
		const workspace = config.workspaces.find((ws) => ws.id === id);

		if (!workspace) {
			return {
				success: false,
				error: "Workspace not found",
			};
		}

		// Optionally remove worktree
		if (removeWorktree) {
			const worktreePath = worktreeManager.getWorktreePath(
				workspace.repoPath,
				workspace.branch,
			);
			await worktreeManager.removeWorktree(workspace.repoPath, worktreePath);
		}

		// Remove from config
		config.workspaces = config.workspaces.filter((ws) => ws.id !== id);
		const saved = configManager.write(config);

		if (!saved) {
			return {
				success: false,
				error: "Failed to save workspace configuration",
			};
		}

		return { success: true };
	} catch (error) {
		console.error("Failed to delete workspace:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Get active selection for a workspace
 */
export function getActiveSelection(workspaceId: string): {
	worktreeId: string | null;
	tabId: string | null;
} | null {
	const workspace = getWorkspace(workspaceId);
	if (!workspace) return null;

	return {
		worktreeId: workspace.activeWorktreeId,
		tabId: workspace.activeTabId,
	};
}

/**
 * Set active selection for a workspace
 */
export function setActiveSelection(
	workspaceId: string,
	worktreeId: string | null,
	tabId: string | null,
): boolean {
	try {
		const config = configManager.read();
		const workspace = config.workspaces.find((ws) => ws.id === workspaceId);
		if (!workspace) return false;

		const previousWorktreeId = workspace.activeWorktreeId;

		workspace.activeWorktreeId = worktreeId;
		workspace.activeTabId = tabId;
		workspace.updatedAt = new Date().toISOString();

		const index = config.workspaces.findIndex((ws) => ws.id === workspaceId);
		if (index !== -1) {
			config.workspaces[index] = workspace;
			const saved = configManager.write(config);

			if (saved && worktreeId && worktreeId !== previousWorktreeId) {
				// Active worktree changed - start monitoring and update proxy
				console.log(
					`[WorkspaceOps] Active worktree changed from ${previousWorktreeId} to ${worktreeId}`,
				);
				startMonitoringWorktree(workspace, worktreeId);
			}

			return saved;
		}

		return false;
	} catch (error) {
		console.error("Failed to set active selection:", error);
		return false;
	}
}

/**
 * Start monitoring all terminals in a worktree
 */
function startMonitoringWorktree(
	workspace: Workspace,
	worktreeId: string,
): void {
	const worktree = workspace.worktrees.find((wt) => wt.id === worktreeId);
	if (!worktree) return;

	console.log(
		`[WorkspaceOps] Starting port monitoring for worktree ${worktree.branch}`,
	);

	// Find all terminal tabs in this worktree
	const terminalTabs = findTerminalTabs(worktree.tabs);

	// Start monitoring each terminal
	for (const tab of terminalTabs) {
		const ptyProcess = terminalManager.getProcess(tab.id);
		if (ptyProcess) {
			// Use tab.cwd if available, otherwise fall back to worktree path
			const cwd = tab.cwd || worktree.path;
			portDetector.startMonitoring(tab.id, worktreeId, ptyProcess, cwd);
			console.log(
				`[WorkspaceOps] Monitoring terminal ${tab.name} (${tab.id}) with CWD: ${cwd}`,
			);
		}
	}

	// Update proxy targets based on detected ports
	proxyManager.updateTargets(workspace);
}

/**
 * Recursively find all terminal tabs
 */
function findTerminalTabs(tabs: Tab[]): Tab[] {
	const terminals: Tab[] = [];

	for (const tab of tabs) {
		if (tab.type === "terminal") {
			terminals.push(tab);
		} else if (tab.type === "group" && tab.tabs) {
			// Recursively search in group tabs
			terminals.push(...findTerminalTabs(tab.tabs));
		}
	}

	return terminals;
}

/**
 * Get active workspace ID
 */
export function getActiveWorkspaceId(): string | null {
	const config = configManager.read();
	return config.activeWorkspaceId;
}

/**
 * Set active workspace ID
 */
export function setActiveWorkspaceId(workspaceId: string): boolean {
	try {
		const config = configManager.read();
		const previousWorkspaceId = config.activeWorkspaceId;
		config.activeWorkspaceId = workspaceId;
		const saved = configManager.write(config);

		if (saved && workspaceId && workspaceId !== previousWorkspaceId) {
			// Workspace changed - initialize proxies
			initializeWorkspaceProxies(workspaceId);
		}

		return saved;
	} catch (error) {
		console.error("Failed to set active workspace ID:", error);
		return false;
	}
}

/**
 * Initialize proxies and monitoring for a workspace
 */
async function initializeWorkspaceProxies(workspaceId: string): Promise<void> {
	const workspace = getWorkspace(workspaceId);
	if (!workspace || !workspace.ports) {
		console.log(
			`[WorkspaceOps] No ports configured for workspace ${workspaceId}`,
		);
		return;
	}

	console.log(
		`[WorkspaceOps] Initializing proxies for workspace ${workspace.name}`,
	);

	// Initialize proxy manager
	await proxyManager.initialize(workspace);

	// Start monitoring active worktree if any
	if (workspace.activeWorktreeId) {
		startMonitoringWorktree(workspace, workspace.activeWorktreeId);
	}
}

/**
 * Save current config to disk
 */
export function saveConfig(): boolean {
	const config = configManager.read();
	return configManager.write(config);
}

/**
 * Update detected ports for a worktree
 */
export function updateDetectedPorts(
	workspaceId: string,
	worktreeId: string,
	detectedPorts: Record<string, number>,
): boolean {
	try {
		const config = configManager.read();
		const workspace = config.workspaces.find((ws) => ws.id === workspaceId);
		if (!workspace) return false;

		const worktree = workspace.worktrees.find((wt) => wt.id === worktreeId);
		if (!worktree) return false;

		worktree.detectedPorts = detectedPorts;
		workspace.updatedAt = new Date().toISOString();

		return configManager.write(config);
	} catch (error) {
		console.error("Failed to update detected ports:", error);
		return false;
	}
}
