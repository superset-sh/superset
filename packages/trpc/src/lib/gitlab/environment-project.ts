import { db } from "@superset/db/client";
import { executeRows } from "@superset/db/utils";
import { sql } from "drizzle-orm";
import {
	authorizedGitlabProject,
	type GitlabBindingRow,
	type GitlabExecutor,
	requireGitlabBinding,
	storedGitlabProject,
} from "./checkout-storage";
import type { GitlabCheckout } from "./types";

export async function gitlabEnvironmentProjects(
	organizationId: string,
	executor: GitlabExecutor = db,
): Promise<Map<string, GitlabCheckout>> {
	const rows = executeRows<GitlabBindingRow & { environment_id: string }>(
		await executor.execute(sql`SELECT p.* FROM gitlab_environment_projects p
 INNER JOIN environments e ON e.id = p.environment_id INNER JOIN connections c ON c.id = p.connection_id AND c.organization_id = e.organization_id
 WHERE e.organization_id = ${organizationId}::uuid AND c.connector = 'gitlab' AND c.owner_kind = 'org'`),
	);
	return new Map(
		rows.map((row) => [row.environment_id, storedGitlabProject(row)]),
	);
}

export async function loadGitlabEnvironmentProject(
	environmentId: string,
	organizationId: string,
	executor: GitlabExecutor = db,
): Promise<GitlabCheckout | null> {
	return (
		(await gitlabEnvironmentProjects(organizationId, executor)).get(
			environmentId,
		) ?? null
	);
}

export async function setGitlabEnvironmentProject(
	executor: GitlabExecutor,
	args: {
		environmentId: string;
		organizationId: string;
		project: GitlabCheckout | null;
	},
): Promise<void> {
	if (!args.project) {
		await executor.execute(
			sql`WITH authorized_environment AS (SELECT id FROM environments WHERE id = ${args.environmentId}::uuid AND organization_id = ${args.organizationId}::uuid FOR SHARE) DELETE FROM gitlab_environment_projects p USING authorized_environment e WHERE p.environment_id = e.id`,
		);
		return;
	}
	const p = args.project;
	const authorized = await authorizedGitlabProject(
		executor,
		args.organizationId,
		p,
	);
	requireGitlabBinding(
		await executor.execute(sql`WITH authorized_connection AS MATERIALIZED (${authorized}), authorized_environment AS (
 SELECT id FROM environments WHERE id = ${args.environmentId}::uuid AND organization_id = (SELECT organization_id FROM authorized_connection) FOR SHARE
 )
 INSERT INTO gitlab_environment_projects (environment_id, connection_id, project_id, path_with_namespace, clone_url, default_branch)
 SELECT e.id, c.id, ${p.projectId}, ${p.pathWithNamespace}, ${p.cloneUrl}, ${p.defaultBranch} FROM authorized_environment e CROSS JOIN authorized_connection c
 ON CONFLICT (environment_id) DO UPDATE SET connection_id = EXCLUDED.connection_id, project_id = EXCLUDED.project_id, path_with_namespace = EXCLUDED.path_with_namespace, clone_url = EXCLUDED.clone_url, default_branch = EXCLUDED.default_branch RETURNING environment_id`),
	);
}
