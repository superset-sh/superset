import type { V1LedgerRow } from "./ledger";

export const WORKTREE_NEEDS_ATTENTION = "worktree-needs-attention";

const ATTENTION_REASONS = new Set([
	WORKTREE_NEEDS_ATTENTION,
	"needs-relocate",
	"multiple-candidates",
	"cloud-unreachable",
	// Also what a repo the app can't read looks like (macOS privacy denial).
	"not-a-git-repo",
]);

export type V1AttentionItem =
	| { kind: "project"; v1Id: string; name: string; path: string }
	| { kind: "worktree"; v1Id: string; name: string; path: string };

export function needsAttention(row: V1LedgerRow): boolean {
	return (
		row.status === "skipped" &&
		(row.kind === "project" || row.kind === "workspace") &&
		!!row.reason &&
		ATTENTION_REASONS.has(row.reason)
	);
}

export function listV1AttentionItems({
	ledgerRows,
	v1Projects,
	v1Workspaces,
	v1Worktrees,
}: {
	ledgerRows: V1LedgerRow[];
	v1Projects: Array<{ id: string; name: string; mainRepoPath: string }>;
	v1Workspaces: Array<{ id: string; name: string; worktreeId: string | null }>;
	v1Worktrees: Array<{ id: string; path: string }>;
}): V1AttentionItem[] {
	const projectsById = new Map(v1Projects.map((p) => [p.id, p]));
	const workspacesById = new Map(v1Workspaces.map((w) => [w.id, w]));
	const worktreesById = new Map(v1Worktrees.map((w) => [w.id, w]));
	const items: V1AttentionItem[] = [];
	for (const row of ledgerRows) {
		if (!needsAttention(row)) continue;
		if (row.kind === "project") {
			const project = projectsById.get(row.v1Id);
			if (project) {
				items.push({
					kind: "project",
					v1Id: project.id,
					name: project.name,
					path: project.mainRepoPath,
				});
			}
			continue;
		}
		const workspace = workspacesById.get(row.v1Id);
		const worktree = workspace?.worktreeId
			? worktreesById.get(workspace.worktreeId)
			: undefined;
		if (workspace && worktree) {
			items.push({
				kind: "worktree",
				v1Id: workspace.id,
				name: workspace.name,
				path: worktree.path,
			});
		}
	}
	return items;
}

export function attentionSignature(items: V1AttentionItem[]): string {
	return items
		.map((item) => `${item.kind}:${item.v1Id}`)
		.sort()
		.join(",");
}

export async function owesFullPass({
	ledgerRows,
	v1Projects,
	v1Workspaces,
	v1Worktrees,
	resolvePaths,
}: {
	ledgerRows: V1LedgerRow[];
	v1Projects: Array<{ id: string; mainRepoPath: string }>;
	v1Workspaces: Array<{
		id: string;
		projectId: string;
		worktreeId: string | null;
	}>;
	v1Worktrees: Array<{ id: string; path: string }>;
	resolvePaths: (paths: string[]) => Promise<(string | null)[]>;
}): Promise<boolean> {
	const failed = (row: V1LedgerRow) =>
		row.status === "error" &&
		(row.kind === "project" || row.kind === "workspace");
	if (ledgerRows.some((row) => needsAttention(row) || failed(row))) {
		return true;
	}
	const projectsById = new Map(v1Projects.map((p) => [p.id, p]));
	const workspacesById = new Map(v1Workspaces.map((w) => [w.id, w]));
	const worktreesById = new Map(v1Worktrees.map((w) => [w.id, w]));
	const paths = ledgerRows.flatMap((row) => {
		if (row.status !== "skipped") return [];
		if (row.kind === "project" && row.reason === "repo-path-missing") {
			const project = projectsById.get(row.v1Id);
			return project ? [project.mainRepoPath] : [];
		}
		if (row.kind !== "workspace") return [];
		const workspace = workspacesById.get(row.v1Id);
		if (row.reason === "repo-path-missing") {
			const project = workspace && projectsById.get(workspace.projectId);
			return project ? [project.mainRepoPath] : [];
		}
		if (row.reason !== "no-worktree-on-disk") return [];
		const worktreeId = workspace?.worktreeId;
		const worktree = worktreeId ? worktreesById.get(worktreeId) : undefined;
		return worktree ? [worktree.path] : [];
	});
	if (paths.length === 0) return false;
	return (await resolvePaths(paths)).some((path) => path !== null);
}
