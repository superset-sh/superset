import { eq } from "drizzle-orm";
import { workspaces } from "../../../../db/schema";
import { resolveDefaultBranchName } from "../../../../runtime/git/refs";
import { protectedProcedure } from "../../../index";
import { searchBranchesInputSchema } from "../schemas";
import {
	decodeCursor,
	encodeNextCursor,
	getRecentBranchOrder,
	listWorktreeBranches,
	markRefetchRemote,
	shouldRefetchRemote,
} from "../shared/branch-search";
import { findLocalProject } from "../shared/local-project";
import type { BranchRow } from "../shared/types";

type BranchAccum = {
	name: string;
	lastCommitDate: number;
	isLocal: boolean;
	isRemote: boolean;
};

export const searchBranches = protectedProcedure
	.input(searchBranchesInputSchema)
	.query(async ({ ctx, input }) => {
		const limit = input.limit ?? 50;
		const offset = decodeCursor(input.cursor);

		const localProject = findLocalProject(ctx, input.projectId);
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

		const defaultBranch = await resolveDefaultBranchName(git);
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
				.map((workspace) => workspace.branch)
				.filter((branch): branch is string => Boolean(branch)),
		);

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
				const [refname, _short, timestamp] = line.split("\t");
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
					continue;
				}

				branchMap.set(name, {
					name,
					lastCommitDate: Number.parseInt(timestamp ?? "0", 10),
					isLocal,
					isRemote,
				});
			}
		} catch (err) {
			console.warn(
				"[workspaceCreation.searchBranches] git for-each-ref failed:",
				err,
			);
		}

		let branches = Array.from(branchMap.values());

		if (input.filter === "worktree") {
			branches = branches.filter((branch) => worktreeMap.has(branch.name));
		} else {
			// default "branch": any branch (local or remote) without a worktree
			branches = branches.filter((branch) => !worktreeMap.has(branch.name));
		}

		if (input.query) {
			const query = input.query.toLowerCase();
			branches = branches.filter((branch) =>
				branch.name.toLowerCase().includes(query),
			);
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
		const items: BranchRow[] = page.map((branch) => ({
			name: branch.name,
			lastCommitDate: branch.lastCommitDate,
			isLocal: branch.isLocal,
			isRemote: branch.isRemote,
			recency: recencyMap.get(branch.name) ?? null,
			worktreePath: worktreeMap.get(branch.name) ?? null,
			hasWorkspace: workspaceBranches.has(branch.name),
			isCheckedOut: checkedOutBranches.has(branch.name),
		}));

		return {
			defaultBranch,
			items,
			nextCursor: encodeNextCursor(offset, limit, branches.length),
		};
	});
