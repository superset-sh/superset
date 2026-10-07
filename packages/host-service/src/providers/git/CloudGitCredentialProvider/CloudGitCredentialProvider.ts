import { unlink } from "node:fs/promises";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import type {
	CredentialProblem,
	GitCredentialProvider,
} from "../../../runtime/git/types";
import { writeTempAskpass } from "../askpass";

interface CachedCredential {
	expiresAt: number;
	askpassPath: string;
}

function supportsCloudGitHubRemote(remoteUrl: string): boolean {
	if (/[\s\\]/.test(remoteUrl)) return false;
	if (/^(?:git@|ssh:)/.test(remoteUrl))
		return parseGitHubRemote(remoteUrl) !== null;
	try {
		const url = new URL(remoteUrl);
		return (
			url.protocol === "https:" &&
			url.hostname === "github.com" &&
			!url.port &&
			!url.username &&
			!url.password
		);
	} catch {
		return false;
	}
}

export class CloudGitCredentialProvider implements GitCredentialProvider {
	private tokenFetcher: (
		remoteUrl: string,
	) => Promise<{ token: string; expiresAt: number }>;
	private cachedCredential: CachedCredential | null = null;
	private cachedToken: { token: string; expiresAt: number } | null = null;

	constructor(
		tokenFetcher: (
			remoteUrl: string,
		) => Promise<{ token: string; expiresAt: number }>,
	) {
		this.tokenFetcher = tokenFetcher;
	}

	async getCredentials(
		remoteUrl: string | null,
	): Promise<{ env: Record<string, string> }> {
		if (!remoteUrl || !supportsCloudGitHubRemote(remoteUrl)) {
			return { env: { GIT_TERMINAL_PROMPT: "0" } };
		}

		if (this.cachedCredential && this.cachedCredential.expiresAt > Date.now()) {
			return {
				env: {
					GIT_ASKPASS: this.cachedCredential.askpassPath,
					GIT_TERMINAL_PROMPT: "0",
				},
			};
		}

		if (this.cachedCredential?.askpassPath) {
			unlink(this.cachedCredential.askpassPath).catch(() => {});
		}

		const { token, expiresAt } = await this.tokenFetcher(remoteUrl);
		const askpassPath = await writeTempAskpass(token);

		this.cachedCredential = { expiresAt, askpassPath };

		return {
			env: {
				GIT_ASKPASS: askpassPath,
				GIT_TERMINAL_PROMPT: "0",
			},
		};
	}

	credentialRemedy(_host: string, problem: CredentialProblem): string {
		return problem === "missing"
			? "No GitHub token for this workspace. Reconnect the GitHub integration."
			: "GitHub rejected this workspace's token. Reconnect the GitHub integration.";
	}

	async getToken(host: string): Promise<string | null> {
		if (host.toLowerCase() !== "github.com") return null;
		if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
			return this.cachedToken.token;
		}

		try {
			const result = await this.tokenFetcher("https://github.com");
			this.cachedToken = result;
			return result.token;
		} catch {
			return null;
		}
	}
}
