import { execFile } from "node:child_process";
import { type FSWatcher, watch } from "node:fs";
import { promisify } from "node:util";
import type { HostDb } from "../db";
import { workspaces } from "../db/schema";

const execFileAsync = promisify(execFile);

const RESCAN_INTERVAL_MS = 30_000;
const DEBOUNCE_MS = 300;

export type GitChangedListener = (workspaceId: string) => void;

interface WatchedWorkspace {
	workspaceId: string;
	worktreePath: string;
	gitDir: string;
	watcher: FSWatcher;
}

/**
 * Watches `.git` directories for all workspaces in the host-service DB.
 * Emits workspace IDs when git state changes (commits, staging, branch switches, etc).
 * Auto-discovers new workspaces and stops watching removed ones every 30s.
 */
export class GitWatcher {
	private readonly db: HostDb;
	private readonly listeners = new Set<GitChangedListener>();
	private readonly watched = new Map<string, WatchedWorkspace>();
	private readonly debounceTimers = new Map<
		string,
		ReturnType<typeof setTimeout>
	>();
	private rescanTimer: ReturnType<typeof setInterval> | null = null;
	private closed = false;

	constructor(db: HostDb) {
		this.db = db;
	}

	start(): void {
		void this.rescan();
		this.rescanTimer = setInterval(
			() => void this.rescan(),
			RESCAN_INTERVAL_MS,
		);
	}

	onChanged(listener: GitChangedListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	close(): void {
		this.closed = true;
		if (this.rescanTimer) {
			clearInterval(this.rescanTimer);
			this.rescanTimer = null;
		}
		for (const timer of this.debounceTimers.values()) {
			clearTimeout(timer);
		}
		this.debounceTimers.clear();
		for (const entry of this.watched.values()) {
			entry.watcher.close();
		}
		this.watched.clear();
	}

	private debouncedEmit(workspaceId: string): void {
		const existing = this.debounceTimers.get(workspaceId);
		if (existing) clearTimeout(existing);
		this.debounceTimers.set(
			workspaceId,
			setTimeout(() => {
				this.debounceTimers.delete(workspaceId);
				for (const listener of this.listeners) {
					listener(workspaceId);
				}
			}, DEBOUNCE_MS),
		);
	}

	private async rescan(): Promise<void> {
		if (this.closed) return;

		let rows: Array<{ id: string; worktreePath: string }>;
		try {
			rows = this.db
				.select({
					id: workspaces.id,
					worktreePath: workspaces.worktreePath,
				})
				.from(workspaces)
				.all();
		} catch {
			return;
		}

		const currentIds = new Set(rows.map((r) => r.id));

		// Remove watchers for workspaces that no longer exist
		for (const [id, entry] of this.watched) {
			if (!currentIds.has(id)) {
				entry.watcher.close();
				this.watched.delete(id);
			}
		}

		// Add watchers for new workspaces
		for (const row of rows) {
			if (this.watched.has(row.id)) continue;
			await this.watchWorkspace(row.id, row.worktreePath);
		}
	}

	private async watchWorkspace(
		workspaceId: string,
		worktreePath: string,
	): Promise<void> {
		if (this.closed) return;

		let gitDir: string;
		try {
			const { stdout } = await execFileAsync(
				"git",
				["rev-parse", "--git-dir"],
				{ cwd: worktreePath },
			);
			gitDir = stdout.trim();
			// If relative, resolve against worktree path
			if (!gitDir.startsWith("/")) {
				gitDir = `${worktreePath}/${gitDir}`;
			}
		} catch {
			// Not a git repo or path doesn't exist — skip
			return;
		}

		if (this.closed || this.watched.has(workspaceId)) return;

		try {
			const watcher = watch(gitDir, { recursive: true }, () => {
				this.debouncedEmit(workspaceId);
			});

			watcher.on("error", () => {
				// Watcher died — remove it so rescan can re-add
				this.watched.delete(workspaceId);
				watcher.close();
			});

			this.watched.set(workspaceId, {
				workspaceId,
				worktreePath,
				gitDir,
				watcher,
			});
		} catch {
			// fs.watch failed (e.g. directory doesn't exist)
		}
	}
}
