import { TRPCError } from "@trpc/server";
import {
	GitlabApiError,
	gitlabPaginated,
	gitlabProjectsForScope,
} from "../../../lib/gitlab/api";
import {
	gitlabConnectionForOrg,
	gitlabCredentialsFor,
} from "../../../lib/gitlab/connection";
import { gitlabScopeAllows } from "../../../lib/gitlab/scope";
import { parseGitLabOrigin } from "../../../lib/gitlab/ssrf";
import type {
	TriggerOptionContext,
	TriggerOptionSource,
} from "../trigger-options";

async function readScope(context: TriggerOptionContext) {
	const connection = await gitlabConnectionForOrg(context.organizationId);
	if (!connection) return null;
	const credentials = await gitlabCredentialsFor(connection.id, {
		organizationId: context.organizationId,
	});
	if (!credentials)
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Reconnect GitLab to load trigger options",
		});
	if (
		credentials.connectionId !== connection.id ||
		credentials.organizationId !== context.organizationId
	)
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "GitLab connection does not match the selected organization",
		});
	const origin = parseGitLabOrigin(credentials.config.host).origin;
	const projects = await gitlabProjectsForScope(
		origin,
		credentials.token,
		credentials.config,
	);
	for (const project of projects) {
		if (
			!Number.isSafeInteger(project.id) ||
			project.id <= 0 ||
			!gitlabScopeAllows(credentials.config, project.path_with_namespace) ||
			(project.name !== undefined && typeof project.name !== "string")
		)
			throw new TRPCError({
				code: "BAD_GATEWAY",
				message: "Invalid GitLab project options",
			});
	}
	return { ...credentials, origin, projects };
}

type Scope = Awaited<ReturnType<typeof readScope>>;
const requests = new WeakMap<TriggerOptionContext, Promise<Scope>>();
function scopeFor(context: TriggerOptionContext) {
	let request = requests.get(context);
	if (!request) {
		request = readScope(context);
		requests.set(context, request);
	}
	return request;
}

const projects: TriggerOptionSource = async (context) => {
	const access = await scopeFor(context);
	return (
		access?.projects.map((project) => {
			const path = project.path_with_namespace;
			if (!path)
				throw new TRPCError({
					code: "BAD_GATEWAY",
					message: "Invalid GitLab project options",
				});
			const slash = path.lastIndexOf("/");
			return {
				id: path,
				label: project.name || path.slice(slash + 1),
				hint: path.slice(0, slash),
			};
		}) ?? []
	);
};

function optionName(value: unknown, labels: boolean): string {
	if (!value || typeof value !== "object")
		throw new TRPCError({
			code: "BAD_GATEWAY",
			message: "Invalid GitLab trigger options",
		});
	const name =
		"name" in value
			? value.name
			: labels && "title" in value
				? value.title
				: undefined;
	if (typeof name !== "string" || !name)
		throw new TRPCError({
			code: "BAD_GATEWAY",
			message: "Invalid GitLab trigger options",
		});
	return name;
}

function names(path: string, labels: boolean): TriggerOptionSource {
	return async (context) => {
		const access = await scopeFor(context);
		if (!access) return [];
		const seen = new Set<string>();
		for (const project of access.projects) {
			const values = await gitlabPaginated<unknown>(
				access.origin,
				access.token,
				`/projects/${project.id}/${path}`,
			);
			for (const value of values) seen.add(optionName(value, labels));
		}
		return [...seen]
			.sort((a, b) => a.localeCompare(b))
			.map((name) => ({ id: name, label: name }));
	};
}

function withGitlabErrors(source: TriggerOptionSource): TriggerOptionSource {
	return async (context) => {
		try {
			return await source(context);
		} catch (cause) {
			if (!(cause instanceof GitlabApiError)) throw cause;
			throw new TRPCError({
				code:
					cause.status === 401
						? "PRECONDITION_FAILED"
						: cause.status === 403
							? "FORBIDDEN"
							: cause.status === 429
								? "TOO_MANY_REQUESTS"
								: "BAD_GATEWAY",
				message: "GitLab trigger options could not be loaded",
				cause,
			});
		}
	};
}

export const gitlabTriggerOptions = {
	projects: withGitlabErrors(projects),
	branches: withGitlabErrors(names("repository/branches", false)),
	labels: withGitlabErrors(names("labels", true)),
};
