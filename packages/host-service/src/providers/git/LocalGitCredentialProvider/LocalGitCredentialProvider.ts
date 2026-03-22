import { execFile } from "node:child_process";
import type { GitCredentialProvider } from "../../../runtime/git/types";

const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;

export class LocalGitCredentialProvider implements GitCredentialProvider {
	private envResolver: () => Promise<Record<string, string>>;
	private cachedToken: { token: string; expiresAt: number } | null = null;
	private inflight: Promise<string | null> | null = null;

	constructor(
		envResolver: () => Promise<Record<string, string>> = async () =>
			process.env as Record<string, string>,
	) {
		this.envResolver = envResolver;
	}

	async getCredentials(
		_remoteUrl: string | null,
	): Promise<{ env: Record<string, string> }> {
		return { env: await this.envResolver() };
	}

	async getToken(host: string): Promise<string | null> {
		const envToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
		if (envToken) return envToken;

		if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
			return this.cachedToken.token;
		}

		if (this.inflight) return this.inflight;

		const promise = this.fetchTokenViaGitCredential(host).finally(() => {
			this.inflight = null;
		});
		this.inflight = promise;
		return promise;
	}

	private async fetchTokenViaGitCredential(
		host: string,
	): Promise<string | null> {
		const env = await this.envResolver();
		return new Promise((resolve) => {
			const child = execFile(
				"git",
				["credential", "fill"],
				{ timeout: 10_000, env },
				(error, stdout) => {
					if (error) {
						resolve(null);
						return;
					}
					const match = stdout.match(/^password=(.+)$/m);
					const token = match?.[1]?.trim() ?? null;
					if (token) {
						this.cachedToken = {
							token,
							expiresAt: Date.now() + TOKEN_CACHE_TTL_MS,
						};
					}
					resolve(token);
				},
			);
			child.stdin?.write(`protocol=https\nhost=${host}\n\n`);
			child.stdin?.end();
		});
	}
}
