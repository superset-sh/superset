import type { GitStatusSnapshot } from "../git-status";
import {
	applyStatusPartial,
	type GitStatusPartial,
	shouldRecomputeInFull,
} from "../git-status-partial";

/**
 * One cached snapshot per (workspace, baseBranch). Readers on the same
 * workspace routinely differ in base branch — the sidebar stats read with
 * none, the Changes tab with the configured one — and only the against-base
 * fields depend on it, so every variant is patched from the same change
 * stream instead of the variants evicting each other.
 */
interface Variant {
	cached: GitStatusSnapshot | null;
	/** Paths changed since `cached`, or null when a full walk is required. */
	pending: Set<string> | null;
	/** Reads on one variant run one at a time so a later read sees the earlier patch. */
	queue: Promise<unknown>;
}

interface ReadInput {
	workspaceId: string;
	baseBranch: string | null;
	computeFull: () => Promise<GitStatusSnapshot>;
	computePartial: (paths: string[]) => Promise<GitStatusPartial>;
}

export class GitStatusStore {
	private readonly workspaces = new Map<string, Map<string, Variant>>();

	attach(workspaceId: string): void {
		if (!this.workspaces.has(workspaceId)) {
			this.workspaces.set(workspaceId, new Map());
		}
	}

	drop(workspaceId: string): void {
		this.workspaces.delete(workspaceId);
	}

	recordChange(workspaceId: string, paths: string[] | undefined): void {
		const variants = this.workspaces.get(workspaceId);
		if (!variants) return;
		for (const variant of variants.values()) {
			if (paths === undefined || variant.pending === null) {
				variant.pending = null;
				continue;
			}
			for (const path of paths) variant.pending.add(path);
		}
	}

	async read(input: ReadInput): Promise<GitStatusSnapshot> {
		const variants = this.workspaces.get(input.workspaceId);
		if (!variants) return input.computeFull();

		const key = input.baseBranch ?? "";
		let variant = variants.get(key);
		if (!variant) {
			variant = { cached: null, pending: null, queue: Promise.resolve() };
			variants.set(key, variant);
		}

		const run = variant.queue.then(() => this.readVariant(input, variant));
		variant.queue = run.catch(() => {});
		return run;
	}

	private async readVariant(
		input: ReadInput,
		variant: Variant,
	): Promise<GitStatusSnapshot> {
		if (!variant.cached || variant.pending === null) {
			return this.readFull(input, variant);
		}
		if (variant.pending.size === 0) return variant.cached;

		const paths = [...variant.pending];
		variant.pending = new Set();

		let partial: GitStatusPartial;
		try {
			partial = await input.computePartial(paths);
		} catch (error) {
			if (variant.pending) for (const path of paths) variant.pending.add(path);
			throw error;
		}

		if (shouldRecomputeInFull(variant.cached, partial)) {
			return this.readFull(input, variant);
		}

		const patched = applyStatusPartial(variant.cached, partial);
		if (this.isLive(input.workspaceId, variant)) variant.cached = patched;
		return patched;
	}

	private async readFull(
		input: ReadInput,
		variant: Variant,
	): Promise<GitStatusSnapshot> {
		variant.pending = new Set();

		let snapshot: GitStatusSnapshot;
		try {
			snapshot = await input.computeFull();
		} catch (error) {
			variant.pending = null;
			throw error;
		}

		// A broad change landed during the walk: the result may predate it.
		if (variant.pending === null) return snapshot;
		if (this.isLive(input.workspaceId, variant)) variant.cached = snapshot;
		return snapshot;
	}

	/** False once the workspace was dropped mid-read; caching would resurrect it. */
	private isLive(workspaceId: string, variant: Variant): boolean {
		const variants = this.workspaces.get(workspaceId);
		if (!variants) return false;
		for (const candidate of variants.values()) {
			if (candidate === variant) return true;
		}
		return false;
	}
}

export const gitStatusStore = new GitStatusStore();
