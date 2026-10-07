import { db } from "@superset/db/client";
import { executeRows } from "@superset/db/utils";
import { parseGitRemote } from "@superset/shared/git-remote";
import { sql } from "drizzle-orm";
import type { gitlabApiFetch } from "./api";
import {
	authorizedGitlabProject,
	type GitlabBindingRow,
	type GitlabExecutor,
	requireGitlabBinding,
	storedGitlabProject,
} from "./checkout-storage";
import {
	gitlabConnectionForOrg,
	gitlabCredentialsFor,
	readGitlabConfig,
} from "./connection";
import {
	GitlabCloneError,
	type ResolvedGitlabProject,
	resolveGitlabProjectClone,
} from "./resolve-clone";
import { gitlabScopeAllows } from "./scope";
import type { GitlabCheckout } from "./types";

export type { ResolvedGitlabProject } from "./resolve-clone";
export { GitlabCloneError } from "./resolve-clone";
export type { GitlabCheckout } from "./types";

export async function resolveGitlabClone(
	args: { organizationId: string; cloneUrl: string },
	options: { send?: typeof gitlabApiFetch } = {},
): Promise<ResolvedGitlabProject> {
	const parsed = parseGitRemote(args.cloneUrl);
	if (!parsed || parsed.provider === "github")
		throw new GitlabCloneError(
			"host",
			"That URL is not on the connected GitLab host",
		);
	const row = await gitlabConnectionForOrg(args.organizationId);
	const config = readGitlabConfig(row?.state);
	if (!row || !config)
		throw new GitlabCloneError(
			"token",
			"Reconnect GitLab to clone this project",
		);
	if (parsed.host !== config.host)
		throw new GitlabCloneError(
			"host",
			"That URL is not on the connected GitLab host",
		);
	const projectPath = `${parsed.owner}/${parsed.name}`;
	if (!gitlabScopeAllows(config, projectPath))
		throw new GitlabCloneError("project", "GitLab could not find that project");
	const credentials = await gitlabCredentialsFor(row.id, {
		organizationId: args.organizationId,
		expected: { host: parsed.host, projectPath },
		send: options.send,
	});
	return resolveGitlabProjectClone(credentials, args.cloneUrl, options.send);
}

export async function recordGitlabProject(
	organizationId: string,
	project: GitlabCheckout,
	executor: GitlabExecutor = db,
): Promise<void> {
	const authorized = await authorizedGitlabProject(
		executor,
		organizationId,
		project,
	);
	requireGitlabBinding(
		await executor.execute(sql`WITH authorized_connection AS (${authorized})
 INSERT INTO gitlab_cloud_projects (organization_id, connection_id, project_id, path_with_namespace, clone_url, default_branch)
 SELECT c.organization_id, c.id, ${project.projectId}, ${project.pathWithNamespace}, ${project.cloneUrl}, ${project.defaultBranch} FROM authorized_connection c
 ON CONFLICT (connection_id, project_id) DO UPDATE SET path_with_namespace = EXCLUDED.path_with_namespace, clone_url = EXCLUDED.clone_url, default_branch = EXCLUDED.default_branch
 WHERE gitlab_cloud_projects.organization_id = EXCLUDED.organization_id RETURNING id`),
	);
}

export async function recordGitlabCheckout(args: {
	cloudWorkspaceId: string;
	organizationId: string;
	project: GitlabCheckout;
	executor?: GitlabExecutor;
}): Promise<void> {
	const executor = args.executor ?? db;
	const p = args.project;
	const authorized = await authorizedGitlabProject(
		executor,
		args.organizationId,
		p,
	);
	requireGitlabBinding(
		await executor.execute(sql`WITH authorized_connection AS MATERIALIZED (${authorized}), authorized_workspace AS (
 SELECT id FROM cloud_workspaces WHERE id = ${args.cloudWorkspaceId}::uuid AND organization_id = (SELECT organization_id FROM authorized_connection) FOR SHARE
 )
 INSERT INTO gitlab_workspace_checkouts (cloud_workspace_id, connection_id, project_id, path_with_namespace, clone_url, default_branch)
 SELECT w.id, c.id, ${p.projectId}, ${p.pathWithNamespace}, ${p.cloneUrl}, ${p.defaultBranch} FROM authorized_workspace w CROSS JOIN authorized_connection c
 ON CONFLICT (cloud_workspace_id) DO UPDATE SET connection_id = EXCLUDED.connection_id, project_id = EXCLUDED.project_id, path_with_namespace = EXCLUDED.path_with_namespace, clone_url = EXCLUDED.clone_url, default_branch = EXCLUDED.default_branch RETURNING cloud_workspace_id`),
	);
}

export async function loadGitlabCheckout(
	cloudWorkspaceId: string,
	organizationId: string,
	executor: GitlabExecutor = db,
): Promise<GitlabCheckout | null> {
	const row = executeRows<GitlabBindingRow>(
		await executor.execute(sql`SELECT p.* FROM gitlab_workspace_checkouts p
 INNER JOIN cloud_workspaces w ON w.id = p.cloud_workspace_id INNER JOIN connections c ON c.id = p.connection_id AND c.organization_id = w.organization_id
 WHERE w.id = ${cloudWorkspaceId}::uuid AND w.organization_id = ${organizationId}::uuid AND c.connector = 'gitlab' AND c.owner_kind = 'org'`),
	)[0];
	return row ? storedGitlabProject(row) : null;
}

export async function listGitlabCheckouts(
	organizationId: string,
	userId: string,
	executor: GitlabExecutor = db,
): Promise<
	Array<{
		cloudWorkspaceId: string;
		pathWithNamespace: string;
		cloneUrl: string;
	}>
> {
	const rows = executeRows<GitlabBindingRow & { cloud_workspace_id: string }>(
		await executor.execute(sql`SELECT p.* FROM gitlab_workspace_checkouts p
 INNER JOIN cloud_workspaces w ON w.id = p.cloud_workspace_id INNER JOIN connections c ON c.id = p.connection_id AND c.organization_id = w.organization_id
 WHERE w.organization_id = ${organizationId}::uuid AND c.connector = 'gitlab' AND c.owner_kind = 'org' AND (w.visibility = 'org' OR w.created_by_user_id = ${userId}::uuid) ORDER BY w.id`),
	);
	return rows.map((row) => {
		const p = storedGitlabProject(row);
		return {
			cloudWorkspaceId: row.cloud_workspace_id,
			pathWithNamespace: p.pathWithNamespace,
			cloneUrl: p.cloneUrl,
		};
	});
}
