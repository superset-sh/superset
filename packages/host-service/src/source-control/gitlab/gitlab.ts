import type { RepositoryIdentity } from "@superset/shared/source-control";
import {
	type ExecGlab,
	type ExecGlabOptions,
	execGlab,
	GitLabError,
} from "./exec-glab";

export type GitLabApiOptions = Omit<
	ExecGlabOptions,
	"instance" | "endpoint" | "runner"
>;

export interface GitLabProject {
	id: number;
	path_with_namespace: string;
	web_url: string;
}

export interface GitLabClient {
	api<T>(
		identity: Pick<RepositoryIdentity, "instance">,
		endpoint: string,
		options?: GitLabApiOptions,
	): Promise<T>;
	getProject(identity: RepositoryIdentity): Promise<GitLabProject>;
}

export function createGitLabClient(
	options: { runner?: ExecGlab } = {},
): GitLabClient {
	const runner = options.runner ?? execGlab;
	return {
		async api<T>(
			identity: Pick<RepositoryIdentity, "instance">,
			endpoint: string,
			apiOptions?: GitLabApiOptions,
		): Promise<T> {
			return (await runner({
				instance: identity.instance,
				endpoint,
				...apiOptions,
			})) as T;
		},
		async getProject(identity) {
			if (identity.provider !== "gitlab") {
				throw new GitLabError("UNSUPPORTED_PROVIDER", identity.instance);
			}
			const project = await this.api<GitLabProject>(
				identity,
				`projects/${encodeURIComponent(identity.repoPath)}`,
			);
			if (
				project.path_with_namespace.toLowerCase() !==
				identity.repoPath.toLowerCase()
			) {
				throw new GitLabError("INACCESSIBLE_PROJECT", identity.instance);
			}
			return project;
		},
	};
}
