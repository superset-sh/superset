import { unlink } from "node:fs/promises";
import type { CredentialProvider } from "../../types";
import { writeTempAskpass } from "./askpass";

interface CachedCredential {
	expiresAt: number;
	askpassPath: string;
}

export class CloudCredentialProvider implements CredentialProvider {
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
		if (!remoteUrl) {
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

		// Clean up old askpass file before writing a new one
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

	async getToken(_host: string): Promise<string | null> {
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
