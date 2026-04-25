import type { HostServiceClient } from "renderer/lib/host-service-client";
import type { electronTrpcClient } from "renderer/lib/trpc-client";
import type { OrgCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { writeV2SidebarState } from "./writeSidebarState";

type ElectronTrpcClient = typeof electronTrpcClient;

export type ProjectStatus = "created" | "linked" | "error";
export type WorkspaceStatus = "adopted" | "skipped" | "error";

export interface ProjectEntry {
	name: string;
	status: ProjectStatus;
	reason?: string;
}

export interface WorkspaceEntry {
	name: string;
	branch: string;
	status: WorkspaceStatus;
	reason?: string;
}

export interface MigrationSummary {
	projectsCreated: number;
	projectsLinked: number;
	projectsErrored: number;
	workspacesCreated: number;
	workspacesSkipped: number;
	workspacesErrored: number;
	projects: ProjectEntry[];
	workspaces: WorkspaceEntry[];
	errors: Array<{
		kind: "project" | "workspace";
		name: string;
		message: string;
	}>;
}

const emptySummary = (): MigrationSummary => ({
	projectsCreated: 0,
	projectsLinked: 0,
	projectsErrored: 0,
	workspacesCreated: 0,
	workspacesSkipped: 0,
	workspacesErrored: 0,
	projects: [],
	workspaces: [],
	errors: [],
});

function trpcCode(err: unknown): string | null {
	if (typeof err !== "object" || err === null) return null;
	const data = (err as { data?: unknown }).data;
	if (typeof data !== "object" || data === null) return null;
	const code = (data as { code?: unknown }).code;
	return typeof code === "string" ? code : null;
}

function errorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}

interface Args {
	organizationId: string;
	electronTrpc: ElectronTrpcClient;
	hostService: HostServiceClient;
	collections: OrgCollections;
}

export async function migrateV1DataToV2(args: Args): Promise<MigrationSummary> {
	const { organizationId, electronTrpc, hostService, collections } = args;
	const summary = emptySummary();

	const [
		v1Projects,
		v1Workspaces,
		v1Worktrees,
		v1Sections,
		existingState,
		otherOrg,
	] = await Promise.all([
		electronTrpc.migration.readV1Projects.query(),
		electronTrpc.migration.readV1Workspaces.query(),
		electronTrpc.migration.readV1Worktrees.query(),
		electronTrpc.migration.readV1WorkspaceSections.query(),
		electronTrpc.migration.listState.query({ organizationId }),
		electronTrpc.migration.findMigrationByOtherOrg.query({ organizationId }),
	]);

	if (otherOrg) {
		throw new Error(
			`v1 data has already been migrated to organization ${otherOrg}. ` +
				"Contact support if you need to migrate to a different organization.",
		);
	}

	const stateByKey = new Map<string, (typeof existingState)[number]>();
	for (const row of existingState) {
		stateByKey.set(`${row.kind}:${row.v1Id}`, row);
	}

	const worktreesById = new Map<string, (typeof v1Worktrees)[number]>();
	for (const wt of v1Worktrees) worktreesById.set(wt.id, wt);

	const projectV1ToV2 = new Map<string, string>();
	for (const row of existingState) {
		if (row.kind === "project" && row.v2Id) {
			projectV1ToV2.set(row.v1Id, row.v2Id);
		}
	}

	const workspaceV1ToV2 = new Map<string, string>();
	for (const row of existingState) {
		if (row.kind === "workspace" && row.v2Id && row.status === "success") {
			workspaceV1ToV2.set(row.v1Id, row.v2Id);
		}
	}

	for (const project of v1Projects) {
		const key = `project:${project.id}`;
		const existing = stateByKey.get(key);
		if (existing && existing.status !== "error") {
			continue;
		}

		try {
			const found = await hostService.project.findByPath.query({
				repoPath: project.mainRepoPath,
			});

			let v2ProjectId: string;
			let status: "success" | "linked";

			if (found.candidates.length > 0) {
				const candidate = found.candidates[0];
				if (!candidate) throw new Error("findByPath returned empty candidate");
				if (found.candidates.length > 1) {
					// Shouldn't happen — v2 has a unique index on
					// (organization_id, lower(repo_clone_url)). Log so it's
					// diagnosable if the constraint ever slips.
					console.warn(
						`[v1-migration] findByPath for ${project.mainRepoPath} returned ${found.candidates.length} candidates; linking to first (${candidate.id})`,
					);
				}
				v2ProjectId = candidate.id;
				status = "linked";
				try {
					await hostService.project.setup.mutate({
						projectId: candidate.id,
						mode: { kind: "import", repoPath: project.mainRepoPath },
					});
				} catch (err) {
					if (trpcCode(err) !== "CONFLICT") throw err;
				}
			} else {
				const created = await hostService.project.create.mutate({
					name: project.name,
					mode: {
						kind: "importLocal",
						repoPath: project.mainRepoPath,
					},
				});
				v2ProjectId = created.projectId;
				status = "success";
			}

			projectV1ToV2.set(project.id, v2ProjectId);
			await electronTrpc.migration.upsertState.mutate({
				v1Id: project.id,
				kind: "project",
				v2Id: v2ProjectId,
				organizationId,
				status,
				reason: null,
			});
			if (status === "success") {
				summary.projectsCreated += 1;
				summary.projects.push({ name: project.name, status: "created" });
			} else {
				summary.projectsLinked += 1;
				summary.projects.push({ name: project.name, status: "linked" });
			}
		} catch (err) {
			const message = errorMessage(err);
			await electronTrpc.migration.upsertState.mutate({
				v1Id: project.id,
				kind: "project",
				v2Id: null,
				organizationId,
				status: "error",
				reason: message,
			});
			summary.projectsErrored += 1;
			summary.projects.push({
				name: project.name,
				status: "error",
				reason: message,
			});
			summary.errors.push({
				kind: "project",
				name: project.name,
				message,
			});
			console.error("[v1-migration] project failed", project.name, err);
		}
	}

	for (const workspace of v1Workspaces) {
		const key = `workspace:${workspace.id}`;
		const existing = stateByKey.get(key);
		if (existing && existing.status !== "error") {
			continue;
		}

		const v2ProjectId = projectV1ToV2.get(workspace.projectId);
		if (!v2ProjectId) {
			await electronTrpc.migration.upsertState.mutate({
				v1Id: workspace.id,
				kind: "workspace",
				v2Id: null,
				organizationId,
				status: "skipped",
				reason: "parent_project_unresolved",
			});
			summary.workspacesSkipped += 1;
			summary.workspaces.push({
				name: workspace.name,
				branch: workspace.branch,
				status: "skipped",
				reason: "parent project did not migrate",
			});
			continue;
		}

		if (workspace.type === "worktree") {
			if (!workspace.worktreeId || !worktreesById.has(workspace.worktreeId)) {
				await electronTrpc.migration.upsertState.mutate({
					v1Id: workspace.id,
					kind: "workspace",
					v2Id: null,
					organizationId,
					status: "skipped",
					reason: "orphan_worktree",
				});
				summary.workspacesSkipped += 1;
				summary.workspaces.push({
					name: workspace.name,
					branch: workspace.branch,
					status: "skipped",
					reason: "worktree record missing",
				});
				continue;
			}
		}

		const v1WorktreePath = workspace.worktreeId
			? worktreesById.get(workspace.worktreeId)?.path
			: undefined;

		try {
			const result = await hostService.workspaceCreation.adopt.mutate({
				projectId: v2ProjectId,
				workspaceName: workspace.name,
				branch: workspace.branch,
				worktreePath: v1WorktreePath,
			});
			await electronTrpc.migration.upsertState.mutate({
				v1Id: workspace.id,
				kind: "workspace",
				v2Id: result.workspace.id,
				organizationId,
				status: "success",
				reason: null,
			});
			workspaceV1ToV2.set(workspace.id, result.workspace.id);
			summary.workspacesCreated += 1;
			summary.workspaces.push({
				name: workspace.name,
				branch: workspace.branch,
				status: "adopted",
			});
		} catch (err) {
			if (trpcCode(err) === "NOT_FOUND") {
				await electronTrpc.migration.upsertState.mutate({
					v1Id: workspace.id,
					kind: "workspace",
					v2Id: null,
					organizationId,
					status: "skipped",
					reason: "worktree_not_registered",
				});
				summary.workspacesSkipped += 1;
				summary.workspaces.push({
					name: workspace.name,
					branch: workspace.branch,
					status: "skipped",
					reason: "worktree no longer exists",
				});
				continue;
			}
			const message = errorMessage(err);
			await electronTrpc.migration.upsertState.mutate({
				v1Id: workspace.id,
				kind: "workspace",
				v2Id: null,
				organizationId,
				status: "error",
				reason: message,
			});
			summary.workspacesErrored += 1;
			summary.workspaces.push({
				name: workspace.name,
				branch: workspace.branch,
				status: "error",
				reason: message,
			});
			summary.errors.push({
				kind: "workspace",
				name: workspace.name,
				message,
			});
			console.error("[v1-migration] workspace failed", workspace.name, err);
		}
	}

	// Translate all sidebar state (project order, sections, workspace order +
	// section membership) in one pass. Main loop above only handles cloud +
	// host-service creates and records migration_state; renderer-side
	// collection writes live entirely in writeV2SidebarState.
	writeV2SidebarState(collections, {
		projectV1ToV2,
		workspaceV1ToV2,
		v1Projects,
		v1Sections,
		v1Workspaces,
	});

	return summary;
}
