import { createHash } from "node:crypto";
import { db } from "@superset/db/client";
import { members } from "@superset/db/schema";
import { executeRows } from "@superset/db/utils";
import { Sandbox } from "@vercel/sandbox";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { storedGitlabProject } from "./checkout-storage";
import { readGitlabConfig } from "./config";
import type { GitlabLfsScope } from "./lfs-actions";
import type { GitlabSandboxIdentity } from "./sandbox-proxy";
import { gitlabScopeAllows } from "./scope";
import { parseGitLabOrigin } from "./ssrf";

export interface GitlabSandboxBinding {
	scope: GitlabLfsScope;
	baseBranch: string;
	workingBranch: string;
	fingerprint: string;
}

const identifier = z.string().uuid();
const rowSchema = z.object({
	workspace_id: identifier,
	organization_id: identifier,
	environment_id: identifier,
	connection_id: identifier,
	provider: z.literal("vercel"),
	provider_sandbox_id: z.string().min(1),
	status: z.enum(["provisioning", "ready"]),
	deleted_at: z.null(),
	created_by_user_id: identifier,
	has_membership: z.literal(true),
	base_branch: z.string().min(1).max(1024),
	working_branch: z.string().min(1).max(1024),
	project_id: z.string().regex(/^[1-9]\d*$/),
	path_with_namespace: z.string(),
	clone_url: z.string(),
	default_branch: z.string(),
	connection_organization_id: identifier,
	connector: z.literal("gitlab"),
	owner_kind: z.literal("org"),
	disconnected_at: z.null(),
	state: z.unknown(),
	has_github_checkout: z.literal(false),
});

function unavailable(): never {
	throw new Error("GitLab sandbox binding is unavailable");
}

function canonical(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value)
				.sort(([a], [b]) => a.localeCompare(b, "en"))
				.map(([key, nested]) => [key, canonical(nested)]),
		);
	return value;
}

function abortable<T>(
	work: () => PromiseLike<T>,
	signal: AbortSignal,
): Promise<T> {
	return new Promise((resolve, reject) => {
		const abort = () => reject(new Error("Cancelled"));
		if (signal.aborted) return abort();
		signal.addEventListener("abort", abort, { once: true });
		Promise.resolve()
			.then(() => {
				signal.throwIfAborted();
				return work();
			})
			.then(
				(value) => {
					signal.removeEventListener("abort", abort);
					if (signal.aborted) abort();
					else resolve(value);
				},
				(error) => {
					signal.removeEventListener("abort", abort);
					reject(error);
				},
			);
	});
}

async function readBinding(
	identity: GitlabSandboxIdentity,
	signal: AbortSignal,
): Promise<GitlabSandboxBinding> {
	const rows = executeRows<unknown>(
		await abortable(
			() =>
				db.execute(sql`SELECT w.id AS workspace_id, w.organization_id, w.environment_id,
 w.provider, w.provider_sandbox_id, w.status, w.deleted_at, w.created_by_user_id,
 w.base_branch, w.branch AS working_branch,
 EXISTS (SELECT 1 FROM ${members} m WHERE m.user_id = w.created_by_user_id AND m.organization_id = w.organization_id) AS has_membership,
 p.connection_id, p.project_id, p.path_with_namespace, p.clone_url, p.default_branch,
 c.organization_id AS connection_organization_id, c.connector, c.owner_kind, c.disconnected_at, c.state,
 EXISTS (SELECT 1 FROM cloud_workspace_repositories g WHERE g.cloud_workspace_id = w.id) AS has_github_checkout
 FROM gitlab_workspace_checkouts p LEFT JOIN cloud_workspaces w ON w.id = p.cloud_workspace_id
 LEFT JOIN connections c ON c.id = p.connection_id
 WHERE w.provider = 'vercel' AND w.provider_sandbox_id = ${identity.sandboxName}`),
			signal,
		),
	);
	if (rows.length !== 1) unavailable();
	const row = rowSchema.parse(rows[0]);
	const config = readGitlabConfig(row.state);
	if (
		row.provider_sandbox_id !== identity.sandboxName ||
		row.connection_organization_id !== row.organization_id ||
		!config ||
		!gitlabScopeAllows(config, row.path_with_namespace)
	)
		unavailable();
	const project = storedGitlabProject(row);
	const origin = parseGitLabOrigin(config.host);
	if (
		origin.port ||
		new URL(project.cloneUrl).origin !== origin.origin ||
		(config.scopeKind !== "group" &&
			config.scopeId !== undefined &&
			config.scopeId !== project.projectId)
	)
		unavailable();
	const scope: GitlabLfsScope = {
		organizationId: row.organization_id,
		workspaceId: row.workspace_id,
		connectionId: row.connection_id,
		providerTeamId: identity.teamId,
		providerProjectId: identity.projectId,
		sandboxId: identity.sandboxId,
		sandboxName: identity.sandboxName,
		projectId: Number(project.projectId),
		projectPath: project.pathWithNamespace,
		origin: origin.origin,
	};
	return {
		scope,
		baseBranch: row.base_branch,
		workingBranch: row.working_branch,
		fingerprint: createHash("sha256")
			.update(
				JSON.stringify([
					scope,
					row.environment_id,
					row.created_by_user_id,
					row.base_branch,
					row.working_branch,
					project.cloneUrl,
					project.defaultBranch,
					canonical(row.state),
				]),
			)
			.digest("hex"),
	};
}

export async function loadGitlabSandboxBinding(
	identity: GitlabSandboxIdentity,
	options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<GitlabSandboxBinding> {
	const timeoutMs = options.timeoutMs ?? 5000;
	if (
		!Number.isSafeInteger(timeoutMs) ||
		timeoutMs < 1 ||
		timeoutMs > 60000 ||
		identity.teamId !== env.VERCEL_SANDBOX_TEAM_ID ||
		identity.projectId !== env.VERCEL_SANDBOX_PROJECT_ID
	)
		unavailable();
	const deadline = new AbortController();
	const timer = setTimeout(() => deadline.abort(), timeoutMs);
	const signal = options.signal
		? AbortSignal.any([options.signal, deadline.signal])
		: deadline.signal;
	try {
		const binding = await readBinding(identity, signal);
		const sandbox = await abortable(
			() =>
				Sandbox.get({
					token: env.VERCEL_SANDBOX_TOKEN,
					teamId: env.VERCEL_SANDBOX_TEAM_ID,
					projectId: env.VERCEL_SANDBOX_PROJECT_ID,
					name: binding.scope.sandboxName,
					resume: false,
					signal,
				}),
			signal,
		);
		if (
			sandbox.name !== binding.scope.sandboxName ||
			sandbox.status !== "running" ||
			sandbox.currentSession().sessionId !== binding.scope.sandboxId
		)
			unavailable();
		const current = await readBinding(identity, signal);
		if (current.fingerprint !== binding.fingerprint || signal.aborted)
			unavailable();
		return current;
	} catch {
		return unavailable();
	} finally {
		clearTimeout(timer);
	}
}
