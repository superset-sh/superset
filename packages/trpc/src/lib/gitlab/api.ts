import { gitlabHeaders } from "./headers";
import { type GitlabScope, gitlabScopeAllows } from "./scope";
import { parseGitLabOrigin } from "./ssrf";
import { safeGitLabFetch } from "./transport";

export class GitlabApiError extends Error {
	constructor(
		readonly status: number,
		path: string,
	) {
		super(`GitLab ${status} for ${path}`);
		this.name = "GitlabApiError";
	}
}

function hasControlCharacters(value: string): boolean {
	return Array.from(value).some((character) => {
		const code = character.charCodeAt(0);
		return code < 32 || code === 127;
	});
}

function assertApiParameterNames(names: Iterable<string>): void {
	const credentials = new Set([
		"private_token",
		"access_token",
		"job_token",
		"bearer_token",
		"sudo",
	]);
	for (const name of names) {
		if (credentials.has(name.split("[")[0] ?? ""))
			throw new Error("GitLab API credential parameter is not allowed");
	}
}

function assertApiBody(body: RequestInit["body"], mediaType: string): void {
	if (body instanceof URLSearchParams) {
		assertApiParameterNames(body.keys());
		return;
	}
	if (typeof body !== "string") return;
	if (!mediaType || mediaType === "application/x-www-form-urlencoded") {
		assertApiParameterNames(new URLSearchParams(body).keys());
		if (mediaType) return;
	}
	const jsonMediaType =
		mediaType === "application/json" ||
		mediaType.endsWith("+json") ||
		mediaType === "text/x-json" ||
		mediaType === "application/jsonrequest";
	if (mediaType && !jsonMediaType) return;
	let json: unknown;
	try {
		json = JSON.parse(body);
	} catch {
		if (jsonMediaType) throw new TypeError("Invalid GitLab API JSON body");
		return;
	}
	if (json && typeof json === "object" && !Array.isArray(json))
		assertApiParameterNames(Object.keys(json));
}

function apiPath(origin: string, path: string): URL {
	const url = new URL(parseGitLabOrigin(origin).origin);
	if (!path.startsWith("/") || path.startsWith("//") || /[\s\\#]/.test(path))
		throw new Error("Invalid GitLab API path");
	const rawPath = path.split("?")[0] ?? "";
	for (const part of rawPath.split("/").slice(1)) {
		let decoded = part;
		for (let round = 0; round < 8; round++) {
			if (
				decoded
					.split(/[\\/]/)
					.some((segment) => segment === "." || segment === "..") ||
				hasControlCharacters(decoded)
			)
				throw new Error("Invalid GitLab API path");
			let next: string;
			try {
				next = decodeURIComponent(decoded);
			} catch {
				if (round === 0) throw new Error("Invalid GitLab API path");
				break;
			}
			if (next === decoded) break;
			if (round === 7) throw new Error("Invalid GitLab API path");
			decoded = next;
		}
	}
	return new URL(path, url);
}

export async function gitlabApiFetch(
	origin: string,
	token: string,
	path: string,
	init: RequestInit = {},
	send = safeGitLabFetch,
): Promise<Response> {
	const url = apiPath(origin, path);
	if (!token || /\s/.test(token) || hasControlCharacters(token))
		throw new Error("Invalid GitLab token");
	assertApiParameterNames(url.searchParams.keys());
	const headers = gitlabHeaders(init.headers);
	const mediaType =
		(headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ??
		"";
	if (init.body != null && mediaType.startsWith("multipart/"))
		throw new TypeError("Unsupported GitLab API multipart body");
	assertApiBody(init.body, mediaType);
	const credentialHeaders = new Set([
		"authorization",
		"private-token",
		"job-token",
		"deploy-token",
		"x-gitlab-static-object-token",
		"gitlab-agent-api-request",
		"gitlab-kas-api-request",
		"sudo",
		"proxy-authorization",
		"cookie",
	]);
	for (const name of [...headers.keys()])
		if (credentialHeaders.has(name.replaceAll("_", "-"))) headers.delete(name);
	headers.set("Authorization", `Bearer ${token}`);
	headers.set("Accept", "application/json");
	return send(`${url.origin}/api/v4${url.pathname}${url.search}`, {
		...init,
		headers,
	});
}

export async function gitlabPaginated<T>(
	origin: string,
	token: string,
	path: string,
	send = gitlabApiFetch,
): Promise<T[]> {
	const url = apiPath(origin, path);
	url.searchParams.set("per_page", "100");
	const items: T[] = [];
	for (let page = 1; ; ) {
		url.searchParams.set("page", String(page));
		const response = await send(
			url.origin,
			token,
			`${url.pathname}${url.search}`,
		);
		if (!response.ok) throw new GitlabApiError(response.status, path);
		const data: unknown = await response.json();
		if (!Array.isArray(data)) throw new Error("Invalid GitLab list response");
		items.push(...data);
		const next = response.headers.get("x-next-page");
		if (next === "" || (next === null && data.length < 100)) return items;
		const nextPage =
			next === null ? page + 1 : /^[1-9]\d*$/.test(next) ? Number(next) : NaN;
		if (!Number.isSafeInteger(nextPage) || nextPage <= page || nextPage > 1000)
			throw new Error("Invalid GitLab pagination");
		page = nextPage;
	}
}

export interface GitlabProject {
	id: number;
	name?: string;
	path_with_namespace?: string;
}

export async function gitlabProjectsForScope(
	origin: string,
	token: string,
	scope: GitlabScope & { scopeId?: string },
	send = gitlabApiFetch,
): Promise<GitlabProject[]> {
	if (!scope.groupPath)
		throw new Error("Reconnect GitLab to select a project or group");
	const id = encodeURIComponent(scope.scopeId ?? scope.groupPath);
	if (scope.scopeKind === "group") {
		const projects = await gitlabPaginated<GitlabProject>(
			origin,
			token,
			`/groups/${id}/projects?include_subgroups=true&with_shared=false&archived=false`,
			send,
		);
		return projects.filter((project) =>
			gitlabScopeAllows(scope, project.path_with_namespace),
		);
	}
	const path = `/projects/${id}`;
	const response = await send(parseGitLabOrigin(origin).origin, token, path);
	if (!response.ok) throw new GitlabApiError(response.status, path);
	const project = (await response.json()) as GitlabProject;
	if (
		!project ||
		!Number.isSafeInteger(project.id) ||
		project.id <= 0 ||
		!gitlabScopeAllows(scope, project.path_with_namespace)
	)
		throw new Error("Project outside GitLab connection scope");
	return [project];
}
