import { parseGitRemote } from "@superset/shared/git-remote";
import { gitlabApiFetch } from "./api";
import { gitlabProjectMetadata } from "./cloud-options";
import { gitlabScopeAllows } from "./scope";
import { parseGitLabOrigin, SsrfError } from "./ssrf";
import type { GitlabCheckout, GitlabProjectCredentials } from "./types";

export interface ResolvedGitlabProject extends GitlabCheckout {
	host: string;
}

export class GitlabCloneError extends Error {
	constructor(
		readonly reason: "host" | "token" | "project",
		message: string,
	) {
		super(message);
		this.name = "GitlabCloneError";
	}
}

export async function resolveGitlabProjectClone(
	credentials: GitlabProjectCredentials | null,
	cloneUrl: string,
	send = gitlabApiFetch,
): Promise<ResolvedGitlabProject> {
	const parsed = parseGitRemote(cloneUrl);
	const hostError = () =>
		new GitlabCloneError(
			"host",
			"That URL is not on the connected GitLab host",
		);
	const projectError = () =>
		new GitlabCloneError("project", "GitLab could not find that project");
	if (!parsed || parsed.provider === "github") throw hostError();
	if (!credentials)
		throw new GitlabCloneError(
			"token",
			"Reconnect GitLab to clone this project",
		);
	try {
		const origin = parseGitLabOrigin(credentials.config.host);
		if (parsed.host !== origin.host) throw hostError();
		const projectPath = `${parsed.owner}/${parsed.name}`;
		if (!gitlabScopeAllows(credentials.config, projectPath))
			throw projectError();
		const response = await send(
			origin.origin,
			credentials.token,
			`/projects/${encodeURIComponent(projectPath)}`,
		);
		if (!response.ok) throw projectError();
		const value: unknown = await response.json().catch(() => null);
		if (
			!value ||
			typeof value !== "object" ||
			!("id" in value) ||
			typeof value.id !== "number" ||
			!Number.isSafeInteger(value.id) ||
			value.id <= 0 ||
			!("path_with_namespace" in value) ||
			value.path_with_namespace !== projectPath ||
			!("http_url_to_repo" in value) ||
			typeof value.http_url_to_repo !== "string" ||
			!value.http_url_to_repo
		)
			throw projectError();
		const project = gitlabProjectMetadata(credentials, value);
		if (!project) throw hostError();
		return { ...project, host: origin.host };
	} catch (error) {
		if (error instanceof SsrfError) throw hostError();
		throw error;
	}
}
