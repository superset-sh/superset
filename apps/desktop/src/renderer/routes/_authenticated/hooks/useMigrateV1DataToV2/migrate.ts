import type { HostServiceClient } from "renderer/lib/host-service-client";
import type { electronTrpcClient } from "renderer/lib/trpc-client";
import type { OrgCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { writeV2SidebarState } from "./writeSidebarState";

type ElectronTrpcClient = typeof electronTrpcClient;

export type ProjectStatus = "created" | "linked" | "synced" | "error";
export type WorkspaceStatus = "adopted" | "synced" | "skipped" | "error";

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

async function setupProjectImport(
	hostService: HostServiceClient,
	projectId: string,
	repoPath: string,
): Promise<void> {
	await hostService.project.setup.mutate({
		projectId,
		mode: { kind: "import", repoPath },
	});
}

function shouldRetryWorkspace(
	existing: { status: string; reason?: string | null } | undefined,
): boolean {
	if (!existing) return true;
	if (existing.status === "success") return false;
	if (existing.status === "error") return true;
	return (
		existing.status === "skipped" &&
		(existing.reason === "parent_project_unresolved" ||
			existing.reason === "orphan_worktree" ||
			existing.reason === "worktree_not_registered")
	);
}

async function hasLocalWorkspace(
	hostService: HostServiceClient,
	workspaceId: string,
): Promise<boolean> {
	try {
		await hostService.workspace.get.query({ id: workspaceId });
		return true;
	} catch (err) {
		if (trpcCode(err) === "NOT_FOUND") return false;
		throw err;
	}
}

function addProjectError(
	summary: MigrationSummary,
	name: string,
	message: string,
): void {
	summary.projectsErrored += 1;
	summary.projects.push({
		name,
		status: "error",
		reason: message,
	});
	summary.errors.push({
		kind: "project",
		name,
		message,
	});
}

function addWorkspaceSkip(
	summary: MigrationSummary,
	name: string,
	branch: string,
	reason: string,
): void {
	summary.workspacesSkipped += 1;
	summary.workspaces.push({
		name,
		branch,
		status: "skipped",
		reason,
	});
}

function skippedWorkspaceReason(reason: string | null | undefined): string {
	switch (reason) {
		case "orphan_worktree":
			return "worktree record missing";
		case "worktree_not_registered":
			return "worktree no longer exists";
		case "parent_project_unresolved":
			return "parent project did not migrate";
		default:
			return reason ?? "skipped";
	}
}

function wasAlreadyMissingWorktreeSkip(
	existing: { status: string; reason?: string | null } | undefined,
): boolean {
	return (
		existing?.status === "skipped" &&
		(existing.reason === "orphan_worktree" ||
			existing.reason === "worktree_not_registered")
	);
}

function addWorkspaceError(
	summary: MigrationSummary,
	name: string,
	branch: string,
	message: string,
): void {
	summary.workspacesErrored += 1;
	summary.workspaces.push({
		name,
		branch,
		status: "error",
		reason: message,
	});
	summary.errors.push({
		kind: "workspace",
		name,
		message,
	});
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
		if (
			row.kind === "project" &&
			row.v2Id &&
			(row.status === "success" || row.status === "linked")
		) {
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
		if (
			existing?.v2Id &&
			(existing.status === "success" || existing.status === "linked")
		) {
			try {
				await setupProjectImport(
					hostService,
					existing.v2Id,
					project.mainRepoPath,
				);
				projectV1ToV2.set(project.id, existing.v2Id);
				summary.projects.push({
					name: project.name,
					status: "synced",
					reason: "Already imported",
				});
			} catch (err) {
				const message = errorMessage(err);
				await electronTrpc.migration.upsertState.mutate({
					v1Id: project.id,
					kind: "project",
					v2Id: existing.v2Id,
					organizationId,
					status: "error",
					reason: message,
				});
				projectV1ToV2.delete(project.id);
				addProjectError(summary, project.name, message);
				console.error(
					"[v1-migration] existing project setup failed",
					project.name,
					err,
				);
			}
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
					console.warn(
						`[v1-migration] findByPath for ${project.mainRepoPath} returned ${found.candidates.length} candidates; migration has no project picker, linking to first (${candidate.id})`,
					);
				}
				v2ProjectId = candidate.id;
				status = "linked";
				await setupProjectImport(
					hostService,
					candidate.id,
					project.mainRepoPath,
				);
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

			await electronTrpc.migration.upsertState.mutate({
				v1Id: project.id,
				kind: "project",
				v2Id: v2ProjectId,
				organizationId,
				status,
				reason: null,
			});
			projectV1ToV2.set(project.id, v2ProjectId);
			if (status === "success") {
				summary.projectsCreated += 1;
				summary.projects.push({ name: project.name, status: "created" });
			} else {
				summary.projectsLinked += 1;
				summary.projects.push({ name: project.name, status: "linked" });
			}
		} catch (err) {
			const message = errorMessage(err);
			projectV1ToV2.delete(project.id);
			await electronTrpc.migration.upsertState.mutate({
				v1Id: project.id,
				kind: "project",
				v2Id: null,
				organizationId,
				status: "error",
				reason: message,
			});
			addProjectError(summary, project.name, message);
			console.error("[v1-migration] project failed", project.name, err);
		}
	}

	for (const workspace of v1Workspaces) {
		const key = `workspace:${workspace.id}`;
		const existing = stateByKey.get(key);
		let recoverCompletedWorkspace = false;
		if (existing?.status === "success" && existing.v2Id) {
			try {
				if (await hasLocalWorkspace(hostService, existing.v2Id)) {
					workspaceV1ToV2.set(workspace.id, existing.v2Id);
					summary.workspaces.push({
						name: workspace.name,
						branch: workspace.branch,
						status: "synced",
						reason: "Already imported",
					});
					continue;
				}
				recoverCompletedWorkspace = true;
			} catch (err) {
				const message = errorMessage(err);
				await electronTrpc.migration.upsertState.mutate({
					v1Id: workspace.id,
					kind: "workspace",
					v2Id: existing.v2Id,
					organizationId,
					status: "error",
					reason: message,
				});
				addWorkspaceError(summary, workspace.name, workspace.branch, message);
				console.error(
					"[v1-migration] workspace local reconciliation failed",
					workspace.name,
					err,
				);
				continue;
			}
		}
		if (!recoverCompletedWorkspace && !shouldRetryWorkspace(existing)) {
			if (existing?.status === "skipped") {
				summary.workspaces.push({
					name: workspace.name,
					branch: workspace.branch,
					status: "skipped",
					reason: skippedWorkspaceReason(existing.reason),
				});
			}
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
			addWorkspaceSkip(
				summary,
				workspace.name,
				workspace.branch,
				"parent project did not migrate",
			);
			continue;
		}

		const v1Worktree = workspace.worktreeId
			? worktreesById.get(workspace.worktreeId)
			: undefined;
		const v1WorktreePath = v1Worktree?.path;
		const v1BaseBranch = v1Worktree?.baseBranch;

		const adoptWorkspace = (worktreePath: string | undefined) =>
			hostService.workspaceCreation.adopt.mutate({
				projectId: v2ProjectId,
				workspaceName: workspace.name,
				branch: workspace.branch,
				baseBranch: v1BaseBranch ?? undefined,
				existingWorkspaceId: existing?.v2Id ?? undefined,
				worktreePath,
			});

		const recordAdoptFailure = async (err: unknown) => {
			if (trpcCode(err) === "NOT_FOUND") {
				const reason = "worktree_not_registered";
				await electronTrpc.migration.upsertState.mutate({
					v1Id: workspace.id,
					kind: "workspace",
					v2Id: null,
					organizationId,
					status: "skipped",
					reason,
				});
				if (wasAlreadyMissingWorktreeSkip(existing)) {
					summary.workspaces.push({
						name: workspace.name,
						branch: workspace.branch,
						status: "skipped",
						reason: skippedWorkspaceReason(reason),
					});
					return;
				}
				addWorkspaceSkip(
					summary,
					workspace.name,
					workspace.branch,
					"worktree no longer exists",
				);
				return;
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
			addWorkspaceError(summary, workspace.name, workspace.branch, message);
			console.error("[v1-migration] workspace failed", workspace.name, err);
		};

		try {
			let result: Awaited<ReturnType<typeof adoptWorkspace>>;
			try {
				result = await adoptWorkspace(v1WorktreePath);
			} catch (err) {
				if (trpcCode(err) !== "NOT_FOUND" || !v1WorktreePath) {
					throw err;
				}

				// v1 worktree rows can be stale while git still has the branch
				// registered at a different path. Retry by branch before giving up.
				result = await adoptWorkspace(undefined);
			}

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
			await recordAdoptFailure(err);
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
