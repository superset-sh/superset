import { db } from "@superset/db/client";
import type { cloudWorkspaces } from "@superset/db/schema";
import { executeRows } from "@superset/db/utils";
import type { SandboxRepository } from "@superset/shared/sandbox-contract";
import { sql } from "drizzle-orm";
import {
	type RepositoryHooks,
	repositoryHooksSchema,
} from "../sandbox/repo-hooks";
import { gitlabApiFetch } from "./api";
import { type GitlabBindingRow, storedGitlabProject } from "./checkout-storage";
import { gitlabProjectMetadata } from "./cloud-options";
import { readGitlabConfig } from "./config";
import { gitlabCredentialsFor } from "./connection";
import { parseGitLabOrigin } from "./ssrf";

export type GitlabClaimWorkspace = Pick<
	typeof cloudWorkspaces.$inferSelect,
	| "id"
	| "organizationId"
	| "provider"
	| "providerSandboxId"
	| "status"
	| "deletedAt"
	| "environmentId"
	| "baseBranch"
	| "branch"
	| "createdByUserId"
>;
export interface GitlabSandboxClaim {
	repository: SandboxRepository;
	origin: string;
	author: { name: string; email: string };
	repoHooks: RepositoryHooks | null;
	recheck(): Promise<void>;
}
type CurrentBinding = GitlabBindingRow & {
	workspace_id: string | null;
	organization_id: string | null;
	provider: string | null;
	provider_sandbox_id: string | null;
	status: string | null;
	deleted_at: Date | null;
	environment_id: string | null;
	base_branch: string | null;
	branch: string | null;
	created_by_user_id: string | null;
	environment_organization_id: string | null;
	environment_provider: string | null;
	connection_organization_id: string | null;
	connector: string | null;
	owner_kind: string | null;
	disconnected_at: Date | null;
	state: unknown;
	creator_id: string | null;
	creator_deleted_at: Date | null;
	creator_name: string | null;
	creator_email: string | null;
	member_user_id: string | null;
	member_organization_id: string | null;
	has_github_links: boolean;
};
function unavailable(): never {
	throw new Error("GitLab sandbox claim is unavailable");
}
async function currentBinding(
	workspaceId: string,
): Promise<CurrentBinding | undefined> {
	const rows = executeRows<CurrentBinding>(
		await db.execute(sql`
 SELECT p.connection_id, p.project_id, p.path_with_namespace, p.clone_url, p.default_branch,
 w.id AS workspace_id, w.organization_id, w.provider,
 w.provider_sandbox_id, w.status, w.deleted_at, w.environment_id, w.base_branch, w.branch, w.created_by_user_id,
 e.organization_id AS environment_organization_id, e.provider AS environment_provider,
 c.organization_id AS connection_organization_id, c.connector, c.owner_kind, c.disconnected_at, c.state,
 u.id AS creator_id, u.deleted_at AS creator_deleted_at, u.name AS creator_name, u.email AS creator_email,
 m.user_id AS member_user_id, m.organization_id AS member_organization_id,
 (EXISTS (SELECT 1 FROM cloud_workspace_repositories r WHERE r.cloud_workspace_id = p.cloud_workspace_id)
 OR EXISTS (SELECT 1 FROM environment_repositories r WHERE r.environment_id = w.environment_id)
 OR e.hooks_repository_id IS NOT NULL) AS has_github_links
 FROM gitlab_workspace_checkouts p
 LEFT JOIN cloud_workspaces w ON w.id = p.cloud_workspace_id
 LEFT JOIN environments e ON e.id = w.environment_id
 LEFT JOIN connections c ON c.id = p.connection_id
 LEFT JOIN auth.users u ON u.id = w.created_by_user_id
 LEFT JOIN auth.members m ON m.user_id = w.created_by_user_id AND m.organization_id = w.organization_id
 WHERE p.cloud_workspace_id = ${workspaceId}::uuid LIMIT 1`),
	);
	return rows[0];
}
export async function assertNoGitlabSandboxBinding(
	workspaceId: string,
): Promise<void> {
	try {
		if (await currentBinding(workspaceId)) unavailable();
	} catch {
		unavailable();
	}
}
function scopeFingerprint(
	config: NonNullable<ReturnType<typeof readGitlabConfig>>,
): string {
	return JSON.stringify([
		config.host,
		config.groupPath,
		config.scopeKind ?? "project",
		config.scopeId ?? null,
		config.auth,
	]);
}
function validate(binding: CurrentBinding, row: GitlabClaimWorkspace) {
	if (
		binding.workspace_id !== row.id ||
		binding.organization_id !== row.organizationId ||
		row.provider !== "vercel" ||
		binding.provider !== row.provider ||
		!/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(row.providerSandboxId) ||
		binding.provider_sandbox_id !== row.providerSandboxId ||
		!["provisioning", "ready"].includes(row.status) ||
		binding.status !== row.status ||
		row.deletedAt !== null ||
		binding.deleted_at !== null ||
		binding.environment_id !== row.environmentId ||
		binding.environment_organization_id !== row.organizationId ||
		binding.environment_provider !== row.provider ||
		!row.baseBranch ||
		!row.branch ||
		binding.base_branch !== row.baseBranch ||
		binding.branch !== row.branch ||
		!row.createdByUserId ||
		binding.created_by_user_id !== row.createdByUserId ||
		binding.creator_id !== row.createdByUserId ||
		binding.creator_deleted_at !== null ||
		binding.member_user_id !== row.createdByUserId ||
		binding.member_organization_id !== row.organizationId ||
		typeof binding.creator_name !== "string" ||
		typeof binding.creator_email !== "string" ||
		binding.connection_organization_id !== row.organizationId ||
		binding.connector !== "gitlab" ||
		binding.owner_kind !== "org" ||
		binding.disconnected_at !== null ||
		binding.has_github_links !== false
	)
		unavailable();
	const project = storedGitlabProject(binding);
	const config = readGitlabConfig(binding.state);
	if (
		!config ||
		((config.scopeKind ?? "project") === "project" &&
			config.scopeId !== undefined &&
			config.scopeId !== project.projectId)
	)
		unavailable();
	const scoped = gitlabProjectMetadata(
		{ connectionId: project.connectionId, config },
		{
			id: Number(project.projectId),
			path_with_namespace: project.pathWithNamespace,
			http_url_to_repo: project.cloneUrl,
			default_branch: project.defaultBranch,
		},
	);
	if (
		!scoped ||
		scoped.cloneUrl !== project.cloneUrl ||
		scoped.defaultBranch !== project.defaultBranch
	)
		unavailable();
	const author = { name: binding.creator_name, email: binding.creator_email };
	return {
		project,
		config,
		author,
		fingerprint: JSON.stringify([project, scopeFingerprint(config), author]),
	};
}
export async function resolveGitlabSandboxClaim(args: {
	row: GitlabClaimWorkspace;
	withRepoHooks?: boolean;
}): Promise<GitlabSandboxClaim | null> {
	const row = { ...args.row };
	try {
		const binding = await currentBinding(row.id);
		if (!binding) return null;
		const snapshot = validate(binding, row);
		const { project, config, author } = snapshot;
		const credentials = await gitlabCredentialsFor(project.connectionId, {
			organizationId: row.organizationId,
			expected: { host: config.host, projectPath: project.pathWithNamespace },
		});
		if (
			!credentials ||
			credentials.connectionId !== project.connectionId ||
			credentials.organizationId !== row.organizationId ||
			scopeFingerprint(credentials.config) !== scopeFingerprint(config)
		)
			unavailable();
		const origin = parseGitLabOrigin(config.host).origin;
		const response = await gitlabApiFetch(
			origin,
			credentials.token,
			`/projects/${project.projectId}`,
		);
		if (!response.ok) unavailable();
		const liveProject = gitlabProjectMetadata(
			credentials,
			await response.json(),
		);
		if (
			!liveProject ||
			liveProject.projectId !== project.projectId ||
			liveProject.pathWithNamespace !== project.pathWithNamespace ||
			liveProject.cloneUrl !== project.cloneUrl
		)
			unavailable();
		let repoHooks: RepositoryHooks | null = null;
		if (args.withRepoHooks) {
			const response = await gitlabApiFetch(
				origin,
				credentials.token,
				`/projects/${project.projectId}/repository/files/.superset%2Fconfig.json/raw?ref=${encodeURIComponent(row.baseBranch)}`,
			);
			if (response.status !== 404) {
				if (!response.ok) unavailable();
				let value: unknown;
				try {
					value = await response.json();
				} catch {
					value = null;
				}
				const parsed = repositoryHooksSchema.safeParse(value);
				if (parsed.success) repoHooks = parsed.data;
			}
		}
		let readyObserved = row.status === "ready";
		return {
			origin,
			author,
			repoHooks,
			repository: {
				provider: "gitlab",
				url: project.cloneUrl,
				branch: row.branch,
				...(row.baseBranch === row.branch
					? {}
					: { baseBranch: row.baseBranch }),
				path: ".",
				hooks: true,
			},
			recheck: async () => {
				try {
					const current = await currentBinding(row.id);
					const expected =
						row.status === "provisioning" &&
						(readyObserved || current?.status === "ready")
							? { ...row, status: "ready" as const }
							: row;
					if (
						!current ||
						validate(current, expected).fingerprint !== snapshot.fingerprint
					)
						unavailable();
					if (current.status === "ready") readyObserved = true;
				} catch {
					unavailable();
				}
			},
		};
	} catch {
		unavailable();
	}
}
