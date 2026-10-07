import type { HostServiceClient } from "renderer/lib/host-service-client";

export interface V1WorkspaceLike {
	id: string;
	projectId: string;
	worktreeId: string | null;
	type?: string;
	name: string;
	branch: string;
}

export interface V1WorktreeLike {
	id: string;
	path: string;
	baseBranch: string | null;
}

export interface HostWorkspaceLike {
	id: string;
	/** Null for project-less "session" workspaces (never adoption targets). */
	projectId: string | null;
	branch: string;
	type?: "local" | "worktree" | "session";
}

export interface AdoptPlanEntry {
	v1WorkspaceId: string;
	v1ProjectId: string;
	v2ProjectId: string;
	name: string;
	branch: string;
	worktreePath: string | undefined;
	baseBranch: string | null;
}

export interface WorkspacePlan {
	toAdopt: AdoptPlanEntry[];
	alreadyAdopted: Array<{
		v1WorkspaceId: string;
		v1ProjectId: string;
		v2ProjectId: string;
		v2WorkspaceId: string;
		name: string;
		branch: string;
	}>;
	/**
	 * A v1 workspace on the branch the project's own checkout has out is
	 * v1's main-repo workspace. It becomes a v2 local workspace on that
	 * checkout — created, not adopted, because there is no worktree to
	 * adopt.
	 */
	toCreateLocal: Array<{
		v1WorkspaceId: string;
		v1ProjectId: string;
		v2ProjectId: string;
		name: string;
	}>;
	/** Branch has no on-disk worktree under the v2 project — nothing to adopt. */
	missingWorktree: Array<{
		v1WorkspaceId: string;
		v2ProjectId: string;
		branch: string;
	}>;
	/** May hold the user's files but can't adopt (detached, or moved and renamed). */
	needsAttention: Array<{
		v1WorkspaceId: string;
		v2ProjectId: string;
		branch: string;
	}>;
	/** v1 project not (yet) imported — retried after projects migrate. */
	unmappedProject: string[];
}

export interface OnDiskWorktree {
	v2ProjectId: string;
	branch: string;
	/** Host rows store git's spelling, not the real path. */
	path: string;
	isMainWorktree: boolean;
	hasWorkspace: boolean;
}

export function hostWorkspaceKey(projectId: string, branch: string): string {
	return `${projectId}\0${branch}`;
}

/**
 * Classify every v1 workspace against current host state. "Already adopted"
 * is decided from the host's local workspace list (host.db is the authority
 * post-local-first — cloud rows are stale). Workspaces whose branch has no
 * on-disk worktree are unadoptable, matching the wizard's visibility filter.
 */
export function planWorkspaceAdoptions({
	v1Workspaces,
	v1WorktreesById,
	v2ProjectIdByV1ProjectId,
	hostWorkspaces,
	onDiskBranchesByV2ProjectId,
	mainBranchByV2ProjectId = new Map(),
	onDiskWorktreeByRealPath = new Map(),
	v1WorktreeRealPathById = new Map(),
}: {
	v1Workspaces: V1WorkspaceLike[];
	v1WorktreesById: Map<string, V1WorktreeLike>;
	v2ProjectIdByV1ProjectId: Map<string, string>;
	hostWorkspaces: HostWorkspaceLike[];
	onDiskBranchesByV2ProjectId: Map<string, Set<string>>;
	/** The branch checked out at each v2 project's repo root. */
	mainBranchByV2ProjectId?: Map<string, string>;
	onDiskWorktreeByRealPath?: Map<string, OnDiskWorktree>;
	v1WorktreeRealPathById?: Map<string, string | null>;
}): WorkspacePlan {
	const hostByKey = new Map<string, string>();
	const localByProject = new Map<string, string>();
	for (const w of hostWorkspaces) {
		// Session workspaces have no project and are never adoption targets.
		if (w.projectId === null) continue;
		hostByKey.set(hostWorkspaceKey(w.projectId, w.branch), w.id);
		if (w.type === "local" && !localByProject.has(w.projectId)) {
			localByProject.set(w.projectId, w.id);
		}
	}

	const plan: WorkspacePlan = {
		toAdopt: [],
		alreadyAdopted: [],
		toCreateLocal: [],
		missingWorktree: [],
		needsAttention: [],
		unmappedProject: [],
	};
	const claimedRealPaths = new Set<string>();
	const claimedKeys = new Set<string>();
	const folderGone: WorkspacePlan["missingWorktree"] = [];

	for (const workspace of v1Workspaces) {
		const v2ProjectId = v2ProjectIdByV1ProjectId.get(workspace.projectId);
		if (!v2ProjectId) {
			plan.unmappedProject.push(workspace.id);
			continue;
		}

		const worktree = workspace.worktreeId
			? v1WorktreesById.get(workspace.worktreeId)
			: undefined;
		const realPath = workspace.worktreeId
			? v1WorktreeRealPathById.get(workspace.worktreeId)
			: undefined;
		// v1's `branch` goes stale after a terminal checkout; the folder doesn't.
		const found = realPath ? onDiskWorktreeByRealPath.get(realPath) : undefined;
		const atPath = found?.v2ProjectId === v2ProjectId ? found : undefined;
		if (realPath && atPath) claimedRealPaths.add(realPath);
		const branch = atPath?.branch ?? workspace.branch;
		const isV1MainRepoWorkspace =
			workspace.type === "branch" && !workspace.worktreeId;

		const v2WorkspaceId = isV1MainRepoWorkspace
			? undefined
			: hostByKey.get(hostWorkspaceKey(v2ProjectId, branch));
		if (v2WorkspaceId) {
			plan.alreadyAdopted.push({
				v1WorkspaceId: workspace.id,
				v1ProjectId: workspace.projectId,
				v2ProjectId,
				v2WorkspaceId,
				name: workspace.name,
				branch,
			});
			continue;
		}

		// A worktree whose folder is gone must not merge into the checkout.
		const onMainCheckout = atPath
			? atPath.isMainWorktree
			: isV1MainRepoWorkspace ||
				(!workspace.worktreeId &&
					mainBranchByV2ProjectId.get(v2ProjectId) === workspace.branch);
		if (onMainCheckout) {
			const localId = localByProject.get(v2ProjectId);
			if (localId) {
				plan.alreadyAdopted.push({
					v1WorkspaceId: workspace.id,
					v1ProjectId: workspace.projectId,
					v2ProjectId,
					v2WorkspaceId: localId,
					name: workspace.name,
					branch,
				});
			} else {
				plan.toCreateLocal.push({
					v1WorkspaceId: workspace.id,
					v1ProjectId: workspace.projectId,
					v2ProjectId,
					name: workspace.name,
				});
			}
			continue;
		}

		const onDiskBranches = onDiskBranchesByV2ProjectId.get(v2ProjectId);
		if (
			!atPath &&
			onDiskBranches !== undefined &&
			!onDiskBranches.has(branch)
		) {
			const missing = { v1WorkspaceId: workspace.id, v2ProjectId, branch };
			if (realPath) plan.needsAttention.push(missing);
			else if (realPath === null) folderGone.push(missing);
			else plan.missingWorktree.push(missing);
			continue;
		}

		claimedKeys.add(hostWorkspaceKey(v2ProjectId, branch));
		plan.toAdopt.push({
			v1WorkspaceId: workspace.id,
			v1ProjectId: workspace.projectId,
			v2ProjectId,
			name: workspace.name,
			branch,
			worktreePath: atPath?.path ?? realPath ?? worktree?.path,
			baseBranch: worktree?.baseBranch ?? null,
		});
	}

	// A moved-and-renamed worktree matches nothing: keep it visible, never guess.
	const unaccountedProjects = new Set<string>();
	for (const [realPath, w] of onDiskWorktreeByRealPath) {
		if (
			!w.isMainWorktree &&
			!w.hasWorkspace &&
			!claimedRealPaths.has(realPath) &&
			!claimedKeys.has(hostWorkspaceKey(w.v2ProjectId, w.branch))
		) {
			unaccountedProjects.add(w.v2ProjectId);
		}
	}
	for (const missing of folderGone) {
		if (unaccountedProjects.has(missing.v2ProjectId)) {
			plan.needsAttention.push(missing);
		} else {
			plan.missingWorktree.push(missing);
		}
	}

	return plan;
}

function trpcCode(err: unknown): string | null {
	if (typeof err !== "object" || err === null) return null;
	const data = (err as { data?: unknown }).data;
	if (typeof data !== "object" || data === null) return null;
	const code = (data as { code?: unknown }).code;
	return typeof code === "string" ? code : null;
}

/**
 * Adopt one v1 workspace's worktree into a v2 workspace row. Tries the
 * explicit v1 worktree path first; if the daemon can't find a worktree
 * there (moved/pruned), falls back to branch-name adoption.
 */
export async function adoptV1Workspace(
	hostClient: HostServiceClient,
	entry: Pick<
		AdoptPlanEntry,
		"v2ProjectId" | "name" | "branch" | "worktreePath" | "baseBranch"
	>,
) {
	const adoptArgs = {
		projectId: entry.v2ProjectId,
		workspaceName: entry.name,
		branch: entry.branch,
		baseBranch: entry.baseBranch ?? undefined,
	};
	try {
		return await hostClient.workspaceCreation.adopt.mutate({
			...adoptArgs,
			worktreePath: entry.worktreePath,
		});
	} catch (err) {
		if (entry.worktreePath && trpcCode(err) === "NOT_FOUND") {
			return await hostClient.workspaceCreation.adopt.mutate(adoptArgs);
		}
		throw err;
	}
}
