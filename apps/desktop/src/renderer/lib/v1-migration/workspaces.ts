import type { HostServiceClient } from "renderer/lib/host-service-client";

export interface V1WorkspaceLike {
	id: string;
	projectId: string;
	worktreeId: string | null;
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
	projectId: string;
	branch: string;
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
	/** Branch has no on-disk worktree under the v2 project — nothing to adopt. */
	missingWorktree: Array<{
		v1WorkspaceId: string;
		v2ProjectId: string;
		branch: string;
	}>;
	/** v1 project not (yet) imported — retried after projects migrate. */
	unmappedProject: string[];
}

function hostWorkspaceKey(projectId: string, branch: string): string {
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
}: {
	v1Workspaces: V1WorkspaceLike[];
	v1WorktreesById: Map<string, V1WorktreeLike>;
	v2ProjectIdByV1ProjectId: Map<string, string>;
	hostWorkspaces: HostWorkspaceLike[];
	onDiskBranchesByV2ProjectId: Map<string, Set<string>>;
}): WorkspacePlan {
	const hostByKey = new Map<string, string>();
	for (const w of hostWorkspaces) {
		hostByKey.set(hostWorkspaceKey(w.projectId, w.branch), w.id);
	}

	const plan: WorkspacePlan = {
		toAdopt: [],
		alreadyAdopted: [],
		missingWorktree: [],
		unmappedProject: [],
	};

	for (const workspace of v1Workspaces) {
		const v2ProjectId = v2ProjectIdByV1ProjectId.get(workspace.projectId);
		if (!v2ProjectId) {
			plan.unmappedProject.push(workspace.id);
			continue;
		}

		const v2WorkspaceId = hostByKey.get(
			hostWorkspaceKey(v2ProjectId, workspace.branch),
		);
		if (v2WorkspaceId) {
			plan.alreadyAdopted.push({
				v1WorkspaceId: workspace.id,
				v1ProjectId: workspace.projectId,
				v2ProjectId,
				v2WorkspaceId,
				name: workspace.name,
				branch: workspace.branch,
			});
			continue;
		}

		const onDiskBranches = onDiskBranchesByV2ProjectId.get(v2ProjectId);
		if (onDiskBranches !== undefined && !onDiskBranches.has(workspace.branch)) {
			plan.missingWorktree.push({
				v1WorkspaceId: workspace.id,
				v2ProjectId,
				branch: workspace.branch,
			});
			continue;
		}

		const worktree = workspace.worktreeId
			? v1WorktreesById.get(workspace.worktreeId)
			: undefined;
		plan.toAdopt.push({
			v1WorkspaceId: workspace.id,
			v1ProjectId: workspace.projectId,
			v2ProjectId,
			name: workspace.name,
			branch: workspace.branch,
			worktreePath: worktree?.path,
			baseBranch: worktree?.baseBranch ?? null,
		});
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
