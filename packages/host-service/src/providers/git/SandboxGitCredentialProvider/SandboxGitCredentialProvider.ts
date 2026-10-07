import { parseGitRemote } from "@superset/shared/git-remote";
import type { SandboxRepository } from "@superset/shared/sandbox-contract";
import type {
	GitCredentialProvider,
	GitLabApiRequest,
} from "../../../runtime/git/types";

export class SandboxGitCredentialProvider implements GitCredentialProvider {
	constructor(
		private readonly github: GitCredentialProvider,
		private readonly repositories: SandboxRepository[],
	) {}
	getToken(host: string): Promise<string | null> {
		return host.toLowerCase() === "github.com"
			? this.github.getToken("github.com")
			: Promise.resolve(null);
	}
	getCredentials(remoteUrl: string | null) {
		return parseGitRemote(remoteUrl ?? "")?.provider === "github"
			? this.github.getCredentials(remoteUrl)
			: Promise.resolve({ env: { GIT_TERMINAL_PROMPT: "0" } });
	}
	credentialRemedy(host: string, problem: "missing" | "rejected") {
		return host === "github.com"
			? this.github.credentialRemedy(host, problem)
			: "Reconnect the GitLab integration for this workspace's project.";
	}
	getGitLabRequest(repo: {
		host: string;
		owner: string;
		name: string;
	}): GitLabApiRequest | undefined {
		const selected = this.repositories.some((repository) => {
			const remote = parseGitRemote(repository.url);
			return (
				repository.provider === "gitlab" &&
				remote?.host === repo.host &&
				remote.owner === repo.owner &&
				remote.name === repo.name
			);
		});
		if (!selected) return undefined;
		return async (path, init) => {
			if (
				!path.startsWith("/") ||
				/[\s\\#]/.test(path) ||
				path.startsWith("//")
			)
				throw new Error("Invalid GitLab API path");
			const segments = (path.split("?")[0] ?? "")
				.slice(1)
				.split("/")
				.map((segment) => decodeURIComponent(segment));
			if (
				segments.some(
					(segment) =>
						!segment ||
						segment.includes("%") ||
						segment.split("/").some((part) => part === "." || part === ".."),
				)
			)
				throw new Error("Invalid GitLab API path");
			const method = init.method ?? "GET";
			const proof = new Headers(init.headers).get(
				"x-superset-gitlab-merge-request",
			);
			const contextualRead =
				(method === "GET" || method === "HEAD") &&
				proof !== null &&
				/^[1-9]\d*$/.test(proof) &&
				Number.isSafeInteger(Number(proof));
			const project = `${repo.owner}/${repo.name}`;
			if (
				!(
					segments[0] === "projects" &&
					(segments[1] === project || contextualRead)
				) &&
				!(path === "/user" && method === "GET")
			)
				throw new Error(
					"GitLab API request does not match the sandbox project",
				);
			const headers = new Headers(init.headers);
			if (
				headers.has("authorization") ||
				headers.has("private-token") ||
				headers.has("job-token")
			)
				throw new Error(
					"Sandbox GitLab requests must not contain provider credentials",
				);
			return fetch(`https://${repo.host}/api/v4${path}`, {
				...init,
				headers,
				redirect: "error",
			});
		};
	}
}
