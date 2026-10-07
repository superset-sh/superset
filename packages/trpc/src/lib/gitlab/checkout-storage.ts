import { executeRows } from "@superset/db/utils";
import { type SQL, sql } from "drizzle-orm";
import { gitlabProjectMetadata } from "./cloud-options";
import { readGitlabConfig } from "./config";
import { parseGitLabOrigin } from "./ssrf";
import type { GitlabCheckout } from "./types";

export type GitlabExecutor = { execute(query: SQL): PromiseLike<unknown> };
export type GitlabBindingRow = {
	connection_id: string;
	project_id: string;
	path_with_namespace: string;
	clone_url: string;
	default_branch: string;
};

export function storedGitlabProject(row: GitlabBindingRow): GitlabCheckout {
	let host: string;
	try {
		host = parseGitLabOrigin(new URL(row.clone_url).origin).host;
	} catch {
		throw new Error("Invalid stored GitLab project");
	}
	const project = gitlabProjectMetadata(
		{
			connectionId: row.connection_id,
			config: {
				host,
				groupPath: row.path_with_namespace,
				scopeKind: "project",
			},
		},
		{
			id: /^[1-9]\d*$/.test(row.project_id) ? Number(row.project_id) : NaN,
			path_with_namespace: row.path_with_namespace,
			http_url_to_repo: row.clone_url,
			default_branch: row.default_branch,
		},
	);
	if (!project) throw new Error("Invalid stored GitLab project");
	return project;
}

export async function authorizedGitlabProject(
	executor: GitlabExecutor,
	organizationId: string,
	project: GitlabCheckout,
): Promise<SQL> {
	const rows = executeRows<{ state: unknown }>(
		await executor.execute(
			sql`SELECT state FROM connections WHERE id = ${project.connectionId}::uuid AND organization_id = ${organizationId}::uuid AND connector = 'gitlab' AND owner_kind = 'org' AND disconnected_at IS NULL`,
		),
	);
	const row = rows[0];
	const config = readGitlabConfig(row?.state);
	if (!row || !config)
		throw new Error("GitLab connection is unavailable in this organization");
	const validated = gitlabProjectMetadata(
		{ connectionId: project.connectionId, config },
		{
			id: /^[1-9]\d*$/.test(project.projectId)
				? Number(project.projectId)
				: NaN,
			path_with_namespace: project.pathWithNamespace,
			http_url_to_repo: project.cloneUrl,
			default_branch: project.defaultBranch,
		},
	);
	if (
		!validated ||
		validated.cloneUrl !== project.cloneUrl ||
		validated.defaultBranch !== project.defaultBranch
	)
		throw new Error("Invalid GitLab project metadata");
	return sql`SELECT id, organization_id FROM connections WHERE id = ${project.connectionId}::uuid AND organization_id = ${organizationId}::uuid AND connector = 'gitlab' AND owner_kind = 'org' AND disconnected_at IS NULL AND state = ${JSON.stringify(row.state)}::jsonb FOR SHARE`;
}

export function requireGitlabBinding(result: unknown): void {
	if (!executeRows(result).length)
		throw new Error(
			"GitLab connection or parent is unavailable in this organization",
		);
}
