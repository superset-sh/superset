import {
	closeSync,
	existsSync,
	fsyncSync,
	mkdirSync,
	openSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getDesktopUiDir, getUiVersionPath } from "../storage/config";
import type {
	DesktopSettings,
	WindowState,
	WorkspaceUiState,
	WorktreeUiMetadata,
} from "./types";

/**
 * UI Store manager for Desktop app
 * Handles persistence of Desktop-specific UI state
 */
export class UiStore {
	private uiDir: string;
	private windowStatePath: string;
	private settingsPath: string;
	private workspacesDir: string;

	constructor() {
		this.uiDir = getDesktopUiDir();
		this.windowStatePath = join(this.uiDir, "window-state.json");
		this.settingsPath = join(this.uiDir, "settings.json");
		this.workspacesDir = join(this.uiDir, "workspaces");

		this.ensureDirectoriesExist();
	}

	private ensureDirectoriesExist(): void {
		if (!existsSync(this.uiDir)) {
			mkdirSync(this.uiDir, { recursive: true, mode: 0o700 });
		}
		if (!existsSync(this.workspacesDir)) {
			mkdirSync(this.workspacesDir, { recursive: true, mode: 0o700 });
		}
	}

	/**
	 * Atomically write data to a file
	 * Writes to a temp file, fsyncs, then renames to avoid partial writes
	 */
	private atomicWrite(filePath: string, data: string): void {
		const tempPath = `${filePath}.tmp`;

		// Write to temp file
		writeFileSync(tempPath, data, "utf-8");

		// Fsync to ensure data is written to disk
		const fd = openSync(tempPath, "r+");
		try {
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}

		// Atomic rename (overwrites existing file atomically on POSIX systems)
		renameSync(tempPath, filePath);
	}

	/**
	 * Read window state
	 */
	readWindowState(): WindowState[] {
		try {
			if (!existsSync(this.windowStatePath)) {
				return [];
			}
			const content = readFileSync(this.windowStatePath, "utf-8");
			return JSON.parse(content) as WindowState[];
		} catch (error) {
			console.error("Failed to read window state:", error);
			return [];
		}
	}

	/**
	 * Write window state
	 */
	writeWindowState(state: WindowState[]): boolean {
		try {
			this.atomicWrite(this.windowStatePath, JSON.stringify(state, null, 2));
			return true;
		} catch (error) {
			console.error("Failed to write window state:", error);
			return false;
		}
	}

	/**
	 * Read settings
	 */
	readSettings(): DesktopSettings {
		try {
			if (!existsSync(this.settingsPath)) {
				return { lastActiveWorkspaceId: null };
			}
			const content = readFileSync(this.settingsPath, "utf-8");
			return JSON.parse(content) as DesktopSettings;
		} catch (error) {
			console.error("Failed to read settings:", error);
			return { lastActiveWorkspaceId: null };
		}
	}

	/**
	 * Write settings
	 */
	writeSettings(settings: DesktopSettings): boolean {
		try {
			this.atomicWrite(this.settingsPath, JSON.stringify(settings, null, 2));
			return true;
		} catch (error) {
			console.error("Failed to write settings:", error);
			return false;
		}
	}

	/**
	 * Read workspace UI state
	 */
	readWorkspaceUiState(workspaceId: string): WorkspaceUiState | null {
		try {
			const workspacePath = join(this.workspacesDir, `${workspaceId}.json`);
			if (!existsSync(workspacePath)) {
				return null;
			}
			const content = readFileSync(workspacePath, "utf-8");
			return JSON.parse(content) as WorkspaceUiState;
		} catch (error) {
			console.error(
				`Failed to read workspace UI state for ${workspaceId}:`,
				error,
			);
			return null;
		}
	}

	/**
	 * Write workspace UI state
	 */
	writeWorkspaceUiState(state: WorkspaceUiState): boolean {
		try {
			const workspacePath = join(
				this.workspacesDir,
				`${state.workspaceId}.json`,
			);
			this.atomicWrite(workspacePath, JSON.stringify(state, null, 2));
			return true;
		} catch (error) {
			console.error(
				`Failed to write workspace UI state for ${state.workspaceId}:`,
				error,
			);
			return false;
		}
	}

	/**
	 * Update workspace UI state (merge with existing)
	 */
	updateWorkspaceUiState(
		workspaceId: string,
		updates: Partial<WorkspaceUiState>,
	): boolean {
		const existing = this.readWorkspaceUiState(workspaceId);
		const updated: WorkspaceUiState = {
			workspaceId,
			activeWorktreePath:
				updates.activeWorktreePath ?? existing?.activeWorktreePath ?? null,
			worktrees: { ...existing?.worktrees, ...updates.worktrees },
			updatedAt: new Date().toISOString(),
		};
		return this.writeWorkspaceUiState(updated);
	}

	/**
	 * Update worktree UI metadata
	 */
	updateWorktreeMetadata(
		workspaceId: string,
		worktreePath: string,
		metadata: Partial<WorktreeUiMetadata>,
	): boolean {
		const existing = this.readWorkspaceUiState(workspaceId);
		const worktrees = existing?.worktrees ?? {};
		const existingMetadata = worktrees[worktreePath];

		const updatedMetadata: WorktreeUiMetadata = {
			path: worktreePath,
			branch: metadata.branch ?? existingMetadata?.branch ?? "",
			description: metadata.description ?? existingMetadata?.description,
			prUrl: metadata.prUrl ?? existingMetadata?.prUrl,
			merged: metadata.merged ?? existingMetadata?.merged,
			tabs: metadata.tabs ?? existingMetadata?.tabs ?? [],
			mosaicTree: metadata.mosaicTree ?? existingMetadata?.mosaicTree,
			activeTabId:
				metadata.activeTabId ?? existingMetadata?.activeTabId ?? null,
			updatedAt: new Date().toISOString(),
		};

		return this.updateWorkspaceUiState(workspaceId, {
			worktrees: {
				...worktrees,
				[worktreePath]: updatedMetadata,
			},
		});
	}

	/**
	 * Get UI version
	 */
	readUiVersion(): number {
		try {
			const versionPath = getUiVersionPath();
			if (!existsSync(versionPath)) {
				return 0;
			}
			const content = readFileSync(versionPath, "utf-8");
			return Number.parseInt(content.trim(), 10);
		} catch (error) {
			console.error("Failed to read UI version:", error);
			return 0;
		}
	}

	/**
	 * Write UI version
	 */
	writeUiVersion(version: number = 1): boolean {
		try {
			const versionPath = getUiVersionPath();
			this.atomicWrite(versionPath, String(version));
			return true;
		} catch (error) {
			console.error("Failed to write UI version:", error);
			return false;
		}
	}

	/**
	 * Check if UI migration is needed
	 */
	needsMigration(): boolean {
		return this.readUiVersion() < 1;
	}
}
