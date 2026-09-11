import type { GitStatusSnapshot } from "../git-status";
import {
	applyStatusPartial,
	type GitStatusPartial,
	shouldRecomputeInFull,
} from "../git-status-partial";

interface Cached {
	baseBranch: string | null;
	snapshot: GitStatusSnapshot;
}

type Pending = Set<string> | null;

export class GitStatusStore {
	private readonly cached = new Map<string, Cached>();
	private readonly pending = new Map<string, Pending>();

	attach(workspaceId: string): void {
		if (!this.pending.has(workspaceId)) this.pending.set(workspaceId, null);
	}

	drop(workspaceId: string): void {
		this.pending.delete(workspaceId);
		this.cached.delete(workspaceId);
	}

	recordChange(workspaceId: string, paths: string[] | undefined): void {
		if (!this.pending.has(workspaceId)) return;
		const current = this.pending.get(workspaceId);
		if (paths === undefined || current == null) {
			this.pending.set(workspaceId, null);
			return;
		}
		for (const path of paths) current.add(path);
	}

	async read({
		workspaceId,
		baseBranch,
		computeFull,
		computePartial,
	}: {
		workspaceId: string;
		baseBranch: string | null;
		computeFull: () => Promise<GitStatusSnapshot>;
		computePartial: (paths: string[]) => Promise<GitStatusPartial>;
	}): Promise<GitStatusSnapshot> {
		if (!this.pending.has(workspaceId)) return computeFull();

		const cached = this.cached.get(workspaceId);
		const pending = this.pending.get(workspaceId);

		if (!cached || cached.baseBranch !== baseBranch || pending == null) {
			return this.readFull(workspaceId, baseBranch, computeFull);
		}

		if (pending.size === 0) return cached.snapshot;

		const paths = [...pending];
		this.pending.set(workspaceId, new Set());

		let partial: GitStatusPartial;
		try {
			partial = await computePartial(paths);
		} catch (error) {
			this.restore(workspaceId, paths);
			throw error;
		}

		if (shouldRecomputeInFull(cached.snapshot, partial)) {
			return this.readFull(workspaceId, baseBranch, computeFull);
		}

		const patched = applyStatusPartial(cached.snapshot, partial);
		if (this.cached.get(workspaceId) === cached) {
			this.cached.set(workspaceId, { baseBranch, snapshot: patched });
		}
		return patched;
	}

	private async readFull(
		workspaceId: string,
		baseBranch: string | null,
		computeFull: () => Promise<GitStatusSnapshot>,
	): Promise<GitStatusSnapshot> {
		if (this.pending.get(workspaceId) !== undefined) {
			this.pending.set(workspaceId, new Set());
		}

		const snapshot = await computeFull();

		if (!this.pending.has(workspaceId)) return snapshot;
		if (this.pending.get(workspaceId) === null) return snapshot;

		this.cached.set(workspaceId, { baseBranch, snapshot });
		return snapshot;
	}

	private restore(workspaceId: string, paths: string[]): void {
		const current = this.pending.get(workspaceId);
		if (current === undefined || current === null) return;
		for (const path of paths) current.add(path);
	}
}

export const gitStatusStore = new GitStatusStore();
