import { randomUUID } from "node:crypto";

import type {
	CreateTabGroupInput,
	CreateTabInput,
	CreateWorkspaceInput,
	CreateWorktreeInput,
	Tab,
	TabGroup,
	UpdateWorkspaceInput,
	Workspace,
	Worktree,
} from "shared/types";

import configManager from "./config-manager";
import worktreeManager from "./worktree-manager";

// Function to create default tabs for a 2x2 grid layout
function createDefaultTabs(): Tab[] {
	const now = new Date().toISOString();
	return [
		{
			id: randomUUID(),
			name: "Terminal 1",
			row: 0,
			col: 0,
			command: null,
			createdAt: now,
		},
		{
			id: randomUUID(),
			name: "Terminal 2",
			row: 0,
			col: 1,
			command: null,
			createdAt: now,
		},
		{
			id: randomUUID(),
			name: "Terminal 3",
			row: 1,
			col: 0,
			command: null,
			createdAt: now,
		},
		{
			id: randomUUID(),
			name: "Terminal 4",
			row: 1,
			col: 1,
			command: null,
			createdAt: now,
		},
	];
}

class WorkspaceManager {
	private static instance: WorkspaceManager;

	private constructor() {}

	static getInstance(): WorkspaceManager {
		if (!WorkspaceManager.instance) {
			WorkspaceManager.instance = new WorkspaceManager();
		}
		return WorkspaceManager.instance;
	}

	/**
	 * Get all workspaces
	 */
	async list(): Promise<Workspace[]> {
		const config = configManager.read();
		return config.workspaces;
	}

	/**
	 * Get a workspace by ID
	 */
	async get(id: string): Promise<Workspace | null> {
		const config = configManager.read();
		return config.workspaces.find((ws) => ws.id === id) || null;
	}

	/**
	 * Create a new workspace (container for worktrees)
	 */
	async create(
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

			// Set as last opened workspace
			configManager.setLastOpenedWorkspaceId(workspace.id);

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
	 * Create a new worktree with a default tab group and tab
	 */
	async createWorktree(
		input: CreateWorktreeInput,
	): Promise<{ success: boolean; worktree?: Worktree; error?: string }> {
		try {
			const workspace = await this.get(input.workspaceId);
			if (!workspace) {
				return { success: false, error: "Workspace not found" };
			}

			// Create git worktree
			const worktreeResult = await worktreeManager.createWorktree(
				workspace.repoPath,
				input.branch,
				input.createBranch || false,
			);

			if (!worktreeResult.success) {
				return {
					success: false,
					error: `Failed to create worktree: ${worktreeResult.error}`,
				};
			}

			// Create default tabs for 2x2 layout
			const now = new Date().toISOString();
			const defaultTabs = createDefaultTabs();

			// Create default tab group with 4 tabs in 2x2 grid
			const defaultTabGroup: TabGroup = {
				id: randomUUID(),
				name: "Default",
				tabs: defaultTabs,
				rows: 2,
				cols: 2,
				createdAt: now,
			};

			// Create worktree object
			const worktree: Worktree = {
				id: randomUUID(),
				branch: input.branch,
				path: worktreeResult.path!,
				tabGroups: [defaultTabGroup],
				createdAt: now,
			};

			// Add to workspace
			workspace.worktrees.push(worktree);
			workspace.updatedAt = now;

			// Save
			const config = configManager.read();
			const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
			if (index !== -1) {
				config.workspaces[index] = workspace;
				configManager.write(config);
			}

			return { success: true, worktree };
		} catch (error) {
			console.error("Failed to create worktree:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Create a new tab group in a worktree
	 */
	async createTabGroup(
		input: CreateTabGroupInput,
	): Promise<{ success: boolean; tabGroup?: TabGroup; error?: string }> {
		try {
			const workspace = await this.get(input.workspaceId);
			if (!workspace) {
				return { success: false, error: "Workspace not found" };
			}

			const worktree = workspace.worktrees.find(
				(wt) => wt.id === input.worktreeId,
			);
			if (!worktree) {
				return { success: false, error: "Worktree not found" };
			}

			const tabGroup: TabGroup = {
				id: randomUUID(),
				name: input.name,
				tabs: [],
				rows: 2,
				cols: 2,
				createdAt: new Date().toISOString(),
			};

			worktree.tabGroups.push(tabGroup);
			workspace.updatedAt = new Date().toISOString();

			// Save
			const config = configManager.read();
			const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
			if (index !== -1) {
				config.workspaces[index] = workspace;
				configManager.write(config);
			}

			return { success: true, tabGroup };
		} catch (error) {
			console.error("Failed to create tab group:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Create a new tab in a tab group
	 */
	async createTab(
		input: CreateTabInput,
	): Promise<{ success: boolean; tab?: Tab; error?: string }> {
		try {
			const workspace = await this.get(input.workspaceId);
			if (!workspace) {
				return { success: false, error: "Workspace not found" };
			}

			const worktree = workspace.worktrees.find(
				(wt) => wt.id === input.worktreeId,
			);
			if (!worktree) {
				return { success: false, error: "Worktree not found" };
			}

			const tabGroup = worktree.tabGroups.find(
				(tg) => tg.id === input.tabGroupId,
			);
			if (!tabGroup) {
				return { success: false, error: "Tab group not found" };
			}

			const tab: Tab = {
				id: randomUUID(),
				name: input.name,
				command: input.command,
				row: input.row,
				col: input.col,
				rowSpan: input.rowSpan,
				colSpan: input.colSpan,
				createdAt: new Date().toISOString(),
			};

			tabGroup.tabs.push(tab);
			workspace.updatedAt = new Date().toISOString();

			// Save
			const config = configManager.read();
			const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
			if (index !== -1) {
				config.workspaces[index] = workspace;
				configManager.write(config);
			}

			return { success: true, tab };
		} catch (error) {
			console.error("Failed to create tab:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Get the last opened workspace
	 */
	async getLastOpened(): Promise<Workspace | null> {
		const lastId = configManager.getLastOpenedWorkspaceId();
		if (!lastId) return null;
		return await this.get(lastId);
	}

	/**
	 * Update a workspace
	 */
	async update(
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
	async delete(
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
	 * Get a tab by ID
	 */
	getTab(
		workspaceId: string,
		worktreeId: string,
		tabGroupId: string,
		tabId: string,
	): Tab | null {
		const config = configManager.read();
		const workspace = config.workspaces.find((ws) => ws.id === workspaceId);
		if (!workspace) return null;

		const worktree = workspace.worktrees.find((wt) => wt.id === worktreeId);
		if (!worktree) return null;

		const tabGroup = worktree.tabGroups.find((tg) => tg.id === tabGroupId);
		if (!tabGroup) return null;

		return tabGroup.tabs.find((t) => t.id === tabId) || null;
	}

	/**
	 * Update terminal CWD in a tab (tab now IS the terminal)
	 */
	updateTerminalCwd(
		workspaceId: string,
		worktreeId: string,
		tabGroupId: string,
		tabId: string,
		cwd: string,
	): boolean {
		try {
			const config = configManager.read();
			const workspace = config.workspaces.find((ws) => ws.id === workspaceId);
			if (!workspace) return false;

			const worktree = workspace.worktrees.find((wt) => wt.id === worktreeId);
			if (!worktree) return false;

			const tabGroup = worktree.tabGroups.find((tg) => tg.id === tabGroupId);
			if (!tabGroup) return false;

			const tab = tabGroup.tabs.find((t) => t.id === tabId);
			if (!tab) return false;

			// Update CWD on the tab itself (tab is the terminal)
			tab.cwd = cwd;
			workspace.updatedAt = new Date().toISOString();

			// Save to config
			const index = config.workspaces.findIndex((ws) => ws.id === workspaceId);
			if (index !== -1) {
				config.workspaces[index] = workspace;
				return configManager.write(config);
			}

			return false;
		} catch (error) {
			console.error("Failed to update terminal CWD:", error);
			return false;
		}
	}

	/**
	 * Scan and import existing git worktrees for a workspace
	 */
	async scanAndImportWorktrees(
		workspaceId: string,
	): Promise<{ success: boolean; imported?: number; error?: string }> {
		try {
			const workspace = await this.get(workspaceId);
			if (!workspace) {
				return { success: false, error: "Workspace not found" };
			}

			// Get all git worktrees from the repository
			const gitWorktrees = worktreeManager.listWorktrees(workspace.repoPath);

			// Include all worktrees (including main repo)
			const allWorktrees = gitWorktrees.filter((wt) => !wt.bare);

			let importedCount = 0;
			const now = new Date().toISOString();

			for (const gitWorktree of allWorktrees) {
				// Check if this worktree is already in our workspace
				const existingWorktree = workspace.worktrees.find(
					(wt) =>
						wt.path === gitWorktree.path || wt.branch === gitWorktree.branch,
				);

				if (!existingWorktree) {
					// Create default tabs for 2x2 layout
					const defaultTabs = createDefaultTabs();

					// Create default tab group with 4 tabs in 2x2 grid
					const defaultTabGroup: TabGroup = {
						id: randomUUID(),
						name: "Default",
						tabs: defaultTabs,
						rows: 2,
						cols: 2,
						createdAt: now,
					};

					// Create worktree object
					const worktree: Worktree = {
						id: randomUUID(),
						branch: gitWorktree.branch,
						path: gitWorktree.path,
						tabGroups: [defaultTabGroup],
						createdAt: now,
					};

					workspace.worktrees.push(worktree);
					importedCount++;
				}
			}

			if (importedCount > 0) {
				workspace.updatedAt = now;

				// Save to config
				const config = configManager.read();
				const index = config.workspaces.findIndex(
					(ws) => ws.id === workspace.id,
				);
				if (index !== -1) {
					config.workspaces[index] = workspace;
					configManager.write(config);
				}
			}

			return { success: true, imported: importedCount };
		} catch (error) {
			console.error("Failed to scan and import worktrees:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}
}

export default WorkspaceManager.getInstance();
