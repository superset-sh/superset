import { eq } from "drizzle-orm";
import type { HostDb } from "../../db";
import { projects, workspaces } from "../../db/schema";

/**
 * Makes a sandbox describe its own workspace, instead of being described from
 * outside.
 *
 * A cloud workspace's sandbox holds exactly one project and one workspace, and
 * both are known before it boots: they are what it was provisioned for. The
 * first version of this reached into the sandbox from the API afterwards —
 * write a seed script, run it against host.db with better-sqlite3, hope the
 * shapes still match. That put the schema in two places and made provisioning
 * a sequence of remote-exec steps that each needed a wait.
 *
 * Reading the same facts from the environment here is the same work with none
 * of the choreography: the API's whole job becomes "start a sandbox with these
 * env vars". Idempotent, so a restart is a no-op.
 */
export interface SandboxIdentity {
	workspaceId: string;
	workspaceName: string;
	projectName: string;
	branch: string;
	worktreePath: string;
}

export function readSandboxIdentity(
	env: NodeJS.ProcessEnv = process.env,
): SandboxIdentity | null {
	const workspaceId = env.SUPERSET_SANDBOX_WORKSPACE_ID;
	const worktreePath = env.SUPERSET_SANDBOX_WORKSPACE_PATH;
	if (!workspaceId || !worktreePath) return null;
	return {
		workspaceId,
		worktreePath,
		workspaceName: env.SUPERSET_SANDBOX_WORKSPACE_NAME || "workspace",
		projectName: env.SUPERSET_SANDBOX_PROJECT_NAME || "project",
		branch: env.SUPERSET_SANDBOX_BRANCH || "main",
	};
}

export function runSandboxSelfSeed(
	db: HostDb,
	identity: SandboxIdentity,
): void {
	const existing = db
		.select({ id: workspaces.id })
		.from(workspaces)
		.where(eq(workspaces.id, identity.workspaceId))
		.get();
	if (existing) return;

	const now = Date.now();
	const projectId = crypto.randomUUID();
	db.insert(projects)
		.values({
			id: projectId,
			repoPath: identity.worktreePath,
			name: identity.projectName,
			createdAt: now,
			updatedAt: now,
		})
		.run();
	// type='main' because the checkout *is* the repo here — there is no base
	// repo it was branched from. It also keeps the boot-time main-workspace
	// sweep from adding a second, phantom workspace to satisfy its
	// one-main-per-project index.
	db.insert(workspaces)
		.values({
			id: identity.workspaceId,
			projectId,
			worktreePath: identity.worktreePath,
			branch: identity.branch,
			name: identity.workspaceName,
			type: "main",
			createdAt: now,
			updatedAt: now,
		})
		.run();
}
