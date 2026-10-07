import {
	GitlabApiError,
	gitlabApiFetch,
	gitlabPaginated,
} from "@superset/trpc/lib/gitlab/api";
import {
	gitlabAccountIdentity,
	gitlabScopeAllows,
} from "@superset/trpc/lib/gitlab/scope";
import { parseGitLabOrigin } from "@superset/trpc/lib/gitlab/ssrf";
import { z } from "zod";

export const gitlabFetch = gitlabApiFetch;
export const GITLAB_HOOK_EVENTS = {
	merge_requests_events: true,
	note_events: true,
	pipeline_events: true,
	issues_events: true,
	push_events: true,
} as const;

const positiveId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const accountSchema = z.object({
	id: positiveId,
	username: z.string().min(1).optional(),
});
const projectSchema = z.object({
	id: positiveId,
	path_with_namespace: z.string(),
});
const groupSchema = z.object({ id: positiveId, full_path: z.string() });

export class GitLabConnectError extends Error {
	constructor(
		readonly code: "token_rejected" | "path_not_found" | "provider_unavailable",
		message: string,
	) {
		super(message);
		this.name = "GitLabConnectError";
	}
}

export function connectFailureCode(
	error: unknown,
): "token_rejected" | "path_not_found" | "provider_unavailable" {
	if (error instanceof GitLabConnectError) return error.code;
	if (error instanceof GitlabApiError) {
		if ([400, 401, 403].includes(error.status)) return "token_rejected";
		if (error.status === 404) return "path_not_found";
	}
	return "provider_unavailable";
}

export interface GitlabIdentity {
	userId: string;
	username: string;
	project: { id: string; pathWithNamespace: string } | null;
	groupId: string | null;
	groupPath?: string;
}

export function gitlabWebhookUrl(
	apiOrigin: string,
	connectionId: string,
): string {
	const url = new URL("/api/gitlab/webhook", apiOrigin);
	url.searchParams.set("connection", connectionId);
	return url.toString();
}

function scopeFailure(): GitLabConnectError {
	return new GitLabConnectError(
		"path_not_found",
		"GitLab could not find that group or project",
	);
}

export async function identifyToken(args: {
	origin: string;
	token: string;
	groupPath: string | null;
	send?: typeof gitlabFetch;
}): Promise<GitlabIdentity> {
	const origin = parseGitLabOrigin(args.origin).origin;
	const path = args.groupPath?.trim().replace(/^\/+|\/+$/g, "");
	if (!path) throw scopeFailure();
	try {
		gitlabAccountIdentity(origin, "group", path);
	} catch {
		throw scopeFailure();
	}
	const tokenFailure = () =>
		new GitLabConnectError("token_rejected", "GitLab rejected that token");
	if (!/^[!-~]+$/.test(args.token)) throw tokenFailure();
	const send = args.send ?? gitlabFetch;
	const userResponse = await send(origin, args.token, "/user");
	if (!userResponse.ok) throw new GitlabApiError(userResponse.status, "/user");
	const user = accountSchema.safeParse(await userResponse.json());
	if (!user.success)
		throw new GitLabConnectError(
			"provider_unavailable",
			"Invalid GitLab account response",
		);
	const account = {
		userId: String(user.data.id),
		username: user.data.username ?? String(user.data.id),
	};
	const encoded = encodeURIComponent(path);
	const projectResponse = await send(
		origin,
		args.token,
		`/projects/${encoded}`,
	);
	if (projectResponse.ok) {
		const project = projectSchema.safeParse(await projectResponse.json());
		if (!project.success)
			throw new GitLabConnectError(
				"provider_unavailable",
				"Invalid GitLab project response",
			);
		if (
			!gitlabScopeAllows(
				{ groupPath: path, scopeKind: "project" },
				project.data.path_with_namespace,
			)
		)
			throw scopeFailure();
		return {
			...account,
			project: {
				id: String(project.data.id),
				pathWithNamespace: project.data.path_with_namespace,
			},
			groupId: null,
			groupPath: project.data.path_with_namespace,
		};
	}
	if (projectResponse.status !== 404)
		throw new GitlabApiError(projectResponse.status, `/projects/${encoded}`);
	const groupResponse = await send(origin, args.token, `/groups/${encoded}`);
	if (!groupResponse.ok)
		throw new GitlabApiError(groupResponse.status, `/groups/${encoded}`);
	const group = groupSchema.safeParse(await groupResponse.json());
	if (!group.success)
		throw new GitLabConnectError(
			"provider_unavailable",
			"Invalid GitLab group response",
		);
	if (group.data.full_path !== path) throw scopeFailure();
	return {
		...account,
		project: null,
		groupId: String(group.data.id),
		groupPath: group.data.full_path,
	};
}

export async function hookProjectIds(args: {
	origin: string;
	token: string;
	identity: GitlabIdentity;
	send?: typeof gitlabFetch;
}): Promise<string[]> {
	if (args.identity.project) return [args.identity.project.id];
	if (!args.identity.groupId || !args.identity.groupPath) return [];
	const projects = await gitlabPaginated<unknown>(
		args.origin,
		args.token,
		`/groups/${encodeURIComponent(args.identity.groupId)}/projects?include_subgroups=true&with_shared=false&simple=true&archived=false`,
		args.send,
	);
	const ids = projects.flatMap((value) => {
		const project = projectSchema.safeParse(value);
		return project.success &&
			gitlabScopeAllows(
				{ groupPath: args.identity.groupPath ?? null, scopeKind: "group" },
				project.data.path_with_namespace,
			)
			? [String(project.data.id)]
			: [];
	});
	return [...new Set(ids)];
}

export async function registerProjectHook(args: {
	origin: string;
	token: string;
	projectId: string;
	hookUrl: string;
	secret: string;
	send?: typeof gitlabFetch;
}): Promise<void> {
	if (
		!/^[1-9]\d*$/.test(args.projectId) ||
		!Number.isSafeInteger(Number(args.projectId))
	)
		throw new Error("Invalid GitLab project ID");
	const hooks = await gitlabPaginated<{ id: number; url?: string }>(
		args.origin,
		args.token,
		`/projects/${args.projectId}/hooks`,
		args.send,
	);
	const existing = hooks.find((hook) => hook?.url === args.hookUrl);
	if (existing && !positiveId.safeParse(existing.id).success)
		throw new Error("Invalid GitLab hook ID");
	const response = await (args.send ?? gitlabFetch)(
		args.origin,
		args.token,
		`/projects/${args.projectId}/hooks${existing ? `/${existing.id}` : ""}`,
		{
			method: existing ? "PUT" : "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				url: args.hookUrl,
				token: args.secret,
				enable_ssl_verification: true,
				...GITLAB_HOOK_EVENTS,
			}),
		},
	);
	if (!response.ok) throw new Error("Could not register the GitLab webhook");
}
