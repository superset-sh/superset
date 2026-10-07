import { gitlabProjectsForScope } from "@superset/trpc/lib/gitlab/api";
import { gitlabScopeAllows } from "@superset/trpc/lib/gitlab/scope";
import { env } from "@/env";
import { resolveGitlabWebhookOrigin } from "@/lib/gitlabWebhookOrigin";
import { gitlabWebhookUrl } from "./gitlab-api";
import { gitlabHookAccess, StaleGitlabConnection } from "./lifecycle";

export class GitlabHookScopeError extends Error {}
export async function reconcileGitlabHooks(args: {
	connectionId: string;
	organizationId: string;
	apiOrigin?: string;
	projectId?: string;
}): Promise<
	{ status: "disconnected" } | { status: "reconciled"; projects: number }
> {
	const hookOrigin = resolveGitlabWebhookOrigin(
		env.GITLAB_WEBHOOK_ORIGIN,
		args.apiOrigin ?? env.NEXT_PUBLIC_API_URL,
	);
	const access = await gitlabHookAccess(args.connectionId, args.organizationId);
	if (!access) return { status: "disconnected" };
	const { config, token, send } = access;
	const origin = `https://${config.host}`;
	try {
		const projects = await gitlabProjectsForScope(origin, token, config, send);
		const selected = args.projectId
			? projects.filter((project) => String(project.id) === args.projectId)
			: projects;
		if (
			(args.projectId && !selected.length) ||
			selected.some(
				(project) =>
					!Number.isSafeInteger(project.id) ||
					project.id <= 0 ||
					!gitlabScopeAllows(config, project.path_with_namespace) ||
					(config.scopeKind !== "group" &&
						config.scopeId !== undefined &&
						config.scopeId !== String(project.id)),
			)
		) {
			throw new GitlabHookScopeError("Project outside connection scope");
		}
		const hookUrl = gitlabWebhookUrl(hookOrigin, args.connectionId);
		for (let offset = 0; offset < selected.length; offset += 4) {
			await Promise.all(
				selected.slice(offset, offset + 4).map((project) =>
					access.registerHook({
						origin,
						token,
						projectId: String(project.id),
						hookUrl,
						secret: config.webhookSecret,
						send,
					}),
				),
			);
		}
		return { status: "reconciled", projects: selected.length };
	} catch (error) {
		if (error instanceof StaleGitlabConnection)
			return { status: "disconnected" };
		throw error;
	}
}
