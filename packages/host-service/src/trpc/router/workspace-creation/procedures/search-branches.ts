import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects, workspaces } from "../../../../db/schema";
import { resolveDefaultBranchName } from "../../../../runtime/git/refs";
import { protectedProcedure } from "../../../index";
import { getRecentBranchOrder, listWorktreeBranches } from "../branch-helpers";

type BranchRow = {
	name: string;
	lastCommitDate: number;
	isLocal: boolean;
	isRemote: boolean;
	recency: number | null;
	worktreePath: string | null;
	// True when a workspaces row exists for this (project, branch) on this
	// host. A worktree can exist on disk without one (orphan); the Worktree
	// tab distinguishes Open (hasWorkspace) from Create (orphan adopt).
	hasWorkspace: boolean;
	isCheckedOut: boolean;
};

function encodeCursor(offset: number): string {
	return Buffer.from(JSON.stringify({ offset })).toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
	if (!cursor) return 0;
	try {
		const parsed = JSON.parse(
			Buffer.from(cursor, "base64url").toString("utf8"),
		);
		const offset = typeof parsed.offset === "number" ? parsed.offset : 0;
		return Math.max(0, offset);
	} catch {
		return 0;
	}
}

// 30s TTL on `git fetch` per project — keeps rapid searches from thrashing.
const REMOTE_REFETCH_TTL_MS = 30_000;
const lastRemoteRefetch = new Map<string, number>();

function shouldRefetchRemote(projectId: string): boolean {
	const last = lastRemoteRefetch.get(projectId) ?? 0;
	return Date.now() - last >= REMOTE_REFETCH_TTL_MS;
}

function markRefetchRemote(projectId: string): void {
	lastRemoteRefetch.set(projectId, Date.now());
}

export const searchBranches = protectedProcedure
	.input(
		z.object({
			projectId: z.string(),
			query: z.string().optional(),
			cursor: z.string().optional(),
			limit: z.number().min(1).max(200).optional(),
			refresh: z.boolean().optional(),
			filter: z.enum(["branch", "worktree"]).optional(),
		}),
	)
	.query(async ({ ctx, input }) => {
		const limit = input.limit ?? 50;
		const offset = decodeCursor(input.cursor);

		const localProject = ctx.db.query.projects
			.findFirst({ where: eq(projects.id, input.projectId) })
			.sync();

		if (!localProject) {
			return {
				defaultBranch: null as string | null,
				items: [] as BranchRow[],
				nextCursor: null as string | null,
			};
		}

		const git = await ctx.git(localProject.repoPath);

		// Honor `refresh` only if TTL elapsed — prevents thrashing `git fetch`
		// on every keystroke when the client tags first-page requests.
		if (input.refresh && shouldRefetchRemote(input.projectId)) {
			markRefetchRemote(input.projectId);
			try {
				await git.fetch(["--prune", "--quiet", "--no-tags"]);
			} catch {
				// offline — proceed with cached refs
			}
		}

		const defaultBranch: string | null = await resolveDefaultBranchName(git);

		const { worktreeMap, checkedOutBranches } = await listWorktreeBranches(
			ctx,
			git,
			input.projectId,
		);
		const recencyMap = await getRecentBranchOrder(git, 30);

		// Branches that already have a workspace row on this host. The
		// Worktree tab uses this to distinguish Open (has row) from
		// Create (orphan worktree — worktree on disk, no workspace row).
		const workspaceBranches = new Set<string>(
			ctx.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.projectId, input.projectId))
				.all()
				.map((w) => w.branch)
				.filter((b): b is string => !!b),
		);

		type BranchAccum = {
			name: string;
			lastCommitDate: number;
			isLocal: boolean;
			isRemote: boolean;
		};
		const branchMap = new Map<string, BranchAccum>();
		try {
			const raw = await git.raw([
				"for-each-ref",
				"--sort=-committerdate",
				"--format=%(refname)\t%(refname:short)\t%(committerdate:unix)",
				"refs/heads/",
				"refs/remotes/origin/",
			]);
			for (const line of raw.trim().split("\n").filter(Boolean)) {
				const [refname, _short, ts] = line.split("\t");
				if (!refname) continue;

				// Derive isLocal/isRemote and the user-facing name from
				// the FULL refname's structural prefix — never from the
				// short form. See GIT_REFS.md.
				let name: string;
				let isLocal = false;
				let isRemote = false;
				if (refname.startsWith("refs/heads/")) {
					name = refname.slice("refs/heads/".length);
					isLocal = true;
				} else if (refname.startsWith("refs/remotes/origin/")) {
					name = refname.slice("refs/remotes/origin/".length);
					isRemote = true;
				} else {
					continue;
				}
				if (!name || name === "HEAD") continue;

				const existing = branchMap.get(name);
				if (existing) {
					existing.isLocal = existing.isLocal || isLocal;
					existing.isRemote = existing.isRemote || isRemote;
				} else {
					branchMap.set(name, {
						name,
						lastCommitDate: Number.parseInt(ts ?? "0", 10),
						isLocal,
						isRemote,
					});
				}
			}
		} catch {
			// ignore
		}

		let branches = Array.from(branchMap.values());

		if (input.filter === "worktree") {
			branches = branches.filter((b) => worktreeMap.has(b.name));
		} else {
			// default "branch": any branch (local or remote) without a worktree
			branches = branches.filter((b) => !worktreeMap.has(b.name));
		}

		if (input.query) {
			const q = input.query.toLowerCase();
			branches = branches.filter((b) => b.name.toLowerCase().includes(q));
		}

		// Sort: default → reflog-recent → everything else by committerdate desc.
		// for-each-ref already emits in committerdate-desc order, so the tail
		// of this sort is a stable no-op for branches outside default/recency.
		branches.sort((a, b) => {
			const aDefault = a.name === defaultBranch ? 0 : 1;
			const bDefault = b.name === defaultBranch ? 0 : 1;
			if (aDefault !== bDefault) return aDefault - bDefault;

			const aRecency = recencyMap.get(a.name);
			const bRecency = recencyMap.get(b.name);
			if (aRecency !== undefined && bRecency !== undefined) {
				return aRecency - bRecency;
			}
			if (aRecency !== undefined) return -1;
			if (bRecency !== undefined) return 1;

			return b.lastCommitDate - a.lastCommitDate;
		});

		const page = branches.slice(offset, offset + limit);
		const hasMore = offset + limit < branches.length;
		const nextCursor = hasMore ? encodeCursor(offset + limit) : null;

		const items: BranchRow[] = page.map((b) => ({
			name: b.name,
			lastCommitDate: b.lastCommitDate,
			isLocal: b.isLocal,
			isRemote: b.isRemote,
			recency: recencyMap.get(b.name) ?? null,
			worktreePath: worktreeMap.get(b.name) ?? null,
			hasWorkspace: workspaceBranches.has(b.name),
			isCheckedOut: checkedOutBranches.has(b.name),
		}));

		return { defaultBranch, items, nextCursor };
	});
