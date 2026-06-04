import { existsSync } from "node:fs";
import { projects } from "../db/schema";
import {
	type EnsureMainWorkspaceContext,
	ensureMainWorkspace,
} from "../trpc/router/project/utils/ensure-main-workspace";

/**
 * Recovery path for projects set up before `type='main'` shipped.
 *
 * Iterates local `projects` and ensures each has a main v2 workspace bound to
 * the current host. Idempotent via the `(projectId, hostId) WHERE type='main'`
 * unique index, so it's safe on every boot — only does real work the first
 * time after upgrade.
 */
export async function runMainWorkspaceSweep(
	ctx: EnsureMainWorkspaceContext,
): Promise<void> {
	const rows = ctx.db
		.select({ id: projects.id, repoPath: projects.repoPath })
		.from(projects)
		.all();

	for (const row of rows) {
		if (!existsSync(row.repoPath)) {
			console.warn(
				`[main-workspace-sweep] skipping ${row.id}: repoPath ${row.repoPath} does not exist`,
			);
			continue;
		}
		await ensureMainWorkspace(ctx, row.id, row.repoPath);
	}
}
