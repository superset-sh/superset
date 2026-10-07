import { z } from "zod";
import { GitlabApiError, gitlabApiFetch } from "./api";
import { gitlabScopeAllows } from "./scope";
import { parseGitLabOrigin } from "./ssrf";
import type { GitlabCheckout, GitlabProjectCredentials } from "./types";

type Send = typeof gitlabApiFetch;
const PAGE_SIZE = 50;
const projectSchema = z.object({
	id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
	path_with_namespace: z.string().min(1),
	http_url_to_repo: z.string(),
	default_branch: z.string().nullish(),
});

function nextPage(
	response: Response,
	page: number,
	count: number,
): number | null {
	const next = response.headers.get("x-next-page");
	if (next === "" || (next === null && count < PAGE_SIZE)) return null;
	const number =
		next === null ? page + 1 : /^[1-9]\d*$/.test(next) ? Number(next) : NaN;
	if (!Number.isSafeInteger(number) || number <= page)
		throw new Error("Invalid GitLab pagination");
	return number;
}
function validatePage(page: number): void {
	if (!Number.isSafeInteger(page) || page <= 0)
		throw new Error("Invalid GitLab page");
}

export function gitlabProjectMetadata(
	credentials: Pick<GitlabProjectCredentials, "connectionId" | "config">,
	value: unknown,
): GitlabCheckout | null {
	const parsed = projectSchema.safeParse(value);
	if (!parsed.success) return null;
	const project = parsed.data;
	if (
		!gitlabScopeAllows(credentials.config, project.path_with_namespace) ||
		/[\s\\]/.test(project.http_url_to_repo)
	)
		return null;
	let url: URL;
	try {
		url = new URL(project.http_url_to_repo);
		const origin = parseGitLabOrigin(credentials.config.host).origin;
		if (
			url.origin !== origin ||
			url.username ||
			url.password ||
			url.search ||
			url.hash ||
			url.pathname !==
				new URL(`/${project.path_with_namespace}.git`, origin).pathname
		)
			return null;
	} catch {
		return null;
	}
	return {
		connectionId: credentials.connectionId,
		projectId: String(project.id),
		pathWithNamespace: project.path_with_namespace,
		cloneUrl: url.toString(),
		defaultBranch: project.default_branch || "main",
	};
}

export async function gitlabProjectPage(
	credentials: GitlabProjectCredentials,
	args: { query?: string; page: number },
	send: Send = gitlabApiFetch,
): Promise<{ items: GitlabCheckout[]; nextPage: number | null }> {
	validatePage(args.page);
	const { config, token } = credentials;
	if (!config.groupPath)
		throw new Error("Reconnect GitLab to select a project or group");
	const origin = parseGitLabOrigin(config.host).origin;
	const id = encodeURIComponent(config.scopeId ?? config.groupPath);
	if (config.scopeKind !== "group") {
		if (args.page !== 1) return { items: [], nextPage: null };
		const path = `/projects/${id}`;
		const response = await send(origin, token, path);
		if (!response.ok) throw new GitlabApiError(response.status, path);
		const project = gitlabProjectMetadata(credentials, await response.json());
		return {
			items:
				project &&
				(!args.query ||
					project.pathWithNamespace
						.toLowerCase()
						.includes(args.query.toLowerCase()))
					? [project]
					: [],
			nextPage: null,
		};
	}
	const params = new URLSearchParams({
		include_subgroups: "true",
		with_shared: "false",
		archived: "false",
		order_by: "path",
		sort: "asc",
		per_page: String(PAGE_SIZE),
		page: String(args.page),
	});
	if (args.query) params.set("search", args.query);
	const path = `/groups/${id}/projects?${params}`;
	const response = await send(origin, token, path);
	if (!response.ok) throw new GitlabApiError(response.status, path);
	const data: unknown = await response.json();
	if (!Array.isArray(data)) throw new Error("Invalid GitLab project response");
	return {
		items: data.flatMap((value) => {
			const project = gitlabProjectMetadata(credentials, value);
			return project ? [project] : [];
		}),
		nextPage: nextPage(response, args.page, data.length),
	};
}

export async function gitlabBranchPage(
	credentials: GitlabProjectCredentials,
	args: {
		projectPath: string;
		defaultBranch: string;
		query?: string;
		page: number;
	},
	send: Send = gitlabApiFetch,
): Promise<{
	defaultBranch: string;
	items: { name: string }[];
	nextPage: number | null;
}> {
	validatePage(args.page);
	if (!gitlabScopeAllows(credentials.config, args.projectPath))
		throw new Error("Project outside GitLab connection scope");
	const params = new URLSearchParams({
		per_page: String(PAGE_SIZE),
		page: String(args.page),
	});
	if (args.query) params.set("search", args.query);
	const path = `/projects/${encodeURIComponent(args.projectPath)}/repository/branches?${params}`;
	const response = await send(
		parseGitLabOrigin(credentials.config.host).origin,
		credentials.token,
		path,
	);
	if (!response.ok) throw new GitlabApiError(response.status, path);
	const data: unknown = await response.json();
	if (!Array.isArray(data)) throw new Error("Invalid GitLab branch response");
	return {
		defaultBranch: args.defaultBranch,
		items: data.flatMap((value) =>
			value && typeof value.name === "string" ? [{ name: value.name }] : [],
		),
		nextPage: nextPage(response, args.page, data.length),
	};
}
