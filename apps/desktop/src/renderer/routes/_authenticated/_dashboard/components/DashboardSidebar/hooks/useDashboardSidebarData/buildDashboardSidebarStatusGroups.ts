import { getV2WorkspaceDisplayName } from "renderer/utils/getV2WorkspaceDisplayName";
import type { ActivePaneStatus } from "shared/tabs-types";
import type {
	DashboardSidebarProject,
	DashboardSidebarProjectChild,
	DashboardSidebarWorkspace,
	SidebarStatusBucket,
} from "../../types";
import type {
	SidebarProjectInput,
	SidebarWorkspaceInput,
} from "./buildDashboardSidebarProjects";
import {
	deriveSidebarStatusBucket,
	SIDEBAR_STATUS_BUCKET_ORDER,
} from "./deriveSidebarStatusBucket";

type SidebarPullRequest = DashboardSidebarWorkspace["pullRequest"];

const BUCKET_LABEL: Record<SidebarStatusBucket, string> = {
	working: "Working",
	waiting: "Waiting",
	open_pr: "Open PR",
	done: "Done",
	idle: "Idle",
};

// Synthetic bucket "projects" have no real created/updated timestamps; a stable
// epoch keeps fingerprints/sorting deterministic.
const EPOCH = new Date(0);

export interface BuildDashboardSidebarStatusGroupsParams {
	sidebarProjects: SidebarProjectInput[];
	visibleSidebarWorkspaces: SidebarWorkspaceInput[];
	machineId: string;
	pullRequestsByWorkspaceId: Map<string, SidebarPullRequest>;
	statusByWorkspaceId: Map<string, ActivePaneStatus | null>;
}

interface BucketEntry {
	tabOrder: number;
	isLocalMain: boolean;
	paneStatus: ActivePaneStatus | null;
	workspace: DashboardSidebarWorkspace;
}

/**
 * Builds status-grouped sidebar "projects" (Working / Open PR / Done / Idle).
 * Returns the same `DashboardSidebarProject[]` shape as
 * `buildDashboardSidebarProjects` so workspace rows render unchanged, but each
 * group is a synthetic status bucket (`kind: "status"`, `id: status:<bucket>`)
 * with no real project chrome. Sections are intentionally ignored (they are a
 * project-scoped concept); every child is a `{ type: "workspace" }`.
 *
 * The per-workspace object construction mirrors `buildDashboardSidebarProjects`
 * so a row looks identical in either grouping mode — keep them in sync.
 */
export function buildDashboardSidebarStatusGroups({
	sidebarProjects,
	visibleSidebarWorkspaces,
	machineId,
	pullRequestsByWorkspaceId,
	statusByWorkspaceId,
}: BuildDashboardSidebarStatusGroupsParams): DashboardSidebarProject[] {
	const projectsById = new Map(
		sidebarProjects.map((project) => [project.id, project]),
	);

	const entriesByBucket = new Map<SidebarStatusBucket, BucketEntry[]>();
	for (const bucket of SIDEBAR_STATUS_BUCKET_ORDER) {
		entriesByBucket.set(bucket, []);
	}

	for (const workspace of visibleSidebarWorkspaces) {
		// Match project-mode visibility: a workspace whose project isn't in the
		// sidebar is not shown in either mode.
		const project = projectsById.get(workspace.projectId);
		if (!project) continue;

		const hostType: DashboardSidebarWorkspace["hostType"] =
			workspace.hostId === machineId ? "local-device" : "remote-device";
		const pullRequest = pullRequestsByWorkspaceId.get(workspace.id) ?? null;
		const paneStatus = statusByWorkspaceId.get(workspace.id) ?? null;

		const sidebarWorkspace: DashboardSidebarWorkspace = {
			id: workspace.id,
			projectId: workspace.projectId,
			hostId: workspace.hostId,
			hostType,
			type: workspace.type,
			hostIsOnline:
				hostType === "remote-device" ? workspace.hostIsOnline : null,
			accentColor: null,
			name: getV2WorkspaceDisplayName(workspace),
			branch: workspace.branch,
			pullRequest,
			repoUrl:
				project.githubOwner && project.githubRepoName
					? `https://github.com/${project.githubOwner}/${project.githubRepoName}`
					: null,
			branchExistsOnRemote:
				project.githubOwner !== null && project.githubRepoName !== null,
			previewUrl: null,
			needsRebase: null,
			behindCount: null,
			createdAt: workspace.createdAt,
			updatedAt: workspace.updatedAt,
			taskId: workspace.taskId,
			pendingTransaction: workspace.pendingTransaction,
			// Prefer the GitHub repo name; fall back to the project name so the
			// chip is never empty. null only if the project itself has no name.
			repoLabel: project.githubRepoName ?? project.name ?? null,
		};

		const bucket = deriveSidebarStatusBucket(paneStatus, pullRequest);
		entriesByBucket.get(bucket)?.push({
			tabOrder: workspace.tabOrder,
			isLocalMain: workspace.type === "main" && hostType === "local-device",
			paneStatus,
			workspace: sidebarWorkspace,
		});
	}

	const groups: DashboardSidebarProject[] = [];
	for (const bucket of SIDEBAR_STATUS_BUCKET_ORDER) {
		const entries = entriesByBucket.get(bucket) ?? [];
		if (entries.length === 0) continue;

		entries.sort((left, right) => {
			// Within Working, surface permission-blocked agents first — the most
			// urgent state (D1).
			if (bucket === "working") {
				const leftBlocked = left.paneStatus === "permission";
				const rightBlocked = right.paneStatus === "permission";
				if (leftBlocked !== rightBlocked) return leftBlocked ? -1 : 1;
			}
			// Then local main workspaces first, then by persisted tab order —
			// matches project-mode ordering.
			if (left.isLocalMain !== right.isLocalMain) {
				return left.isLocalMain ? -1 : 1;
			}
			return left.tabOrder - right.tabOrder;
		});

		const children: DashboardSidebarProjectChild[] = entries.map(
			({ workspace }) => ({ type: "workspace", workspace }),
		);

		groups.push({
			id: `status:${bucket}`,
			name: BUCKET_LABEL[bucket],
			slug: bucket,
			kind: "status",
			statusBucket: bucket,
			githubRepositoryId: null,
			githubOwner: null,
			githubRepoName: null,
			iconUrl: null,
			createdAt: EPOCH,
			updatedAt: EPOCH,
			isCollapsed: false,
			children,
		});
	}

	return groups;
}
