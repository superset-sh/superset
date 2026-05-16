import {
	type SelectProject,
	type SelectWorkspace,
	workspaces,
} from "@superset/local-db";
import { and, eq, isNull, not } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import {
	activateProject,
	getBranchWorkspace,
	setLastActiveWorkspace,
	touchWorkspace,
} from "./db-helpers";

export interface RecoverBranchWorkspaceResult {
	workspace: SelectWorkspace;
	worktreePath: string;
	projectId: string;
	wasExisting: boolean;
}

/**
 * Create or recover the project's `type:"branch"` workspace that points at
 * the project's main repo. Used when the mainline branch is still checked
 * out at the main repo path but Superset's record of it was deleted — most
 * commonly because the user accidentally clicked "x" on the main workspace
 * (issue #4523). Mirrors the inner logic of `openMainRepoWorkspace` so both
 * entry points stay in sync.
 */
export function recoverBranchWorkspace({
	project,
	branch,
	name,
}: {
	project: Pick<SelectProject, "id" | "mainRepoPath" | "tabOrder">;
	branch: string;
	name?: string;
}): RecoverBranchWorkspaceResult {
	const existing = getBranchWorkspace(project.id);

	if (existing) {
		if (existing.branch !== branch) {
			localDb
				.update(workspaces)
				.set({ branch })
				.where(eq(workspaces.id, existing.id))
				.run();
		}
		touchWorkspace(existing.id);
		setLastActiveWorkspace(existing.id);
		return {
			workspace: { ...existing, branch, lastOpenedAt: Date.now() },
			worktreePath: project.mainRepoPath,
			projectId: project.id,
			wasExisting: true,
		};
	}

	const inserted = localDb
		.insert(workspaces)
		.values({
			projectId: project.id,
			type: "branch",
			branch,
			name: name ?? branch,
			tabOrder: 0,
		})
		.onConflictDoNothing()
		.returning()
		.all();

	if (inserted.length > 0) {
		const newWorkspaceId = inserted[0].id;
		const others = localDb
			.select()
			.from(workspaces)
			.where(
				and(
					eq(workspaces.projectId, project.id),
					not(eq(workspaces.id, newWorkspaceId)),
					isNull(workspaces.deletingAt),
				),
			)
			.all();
		for (const ws of others) {
			localDb
				.update(workspaces)
				.set({ tabOrder: ws.tabOrder + 1 })
				.where(eq(workspaces.id, ws.id))
				.run();
		}
	}

	const workspace = inserted[0] ?? getBranchWorkspace(project.id);
	if (!workspace) {
		throw new Error("Failed to recover branch workspace for project");
	}

	setLastActiveWorkspace(workspace.id);
	activateProject(project as SelectProject);

	return {
		workspace,
		worktreePath: project.mainRepoPath,
		projectId: project.id,
		wasExisting: inserted.length === 0,
	};
}
