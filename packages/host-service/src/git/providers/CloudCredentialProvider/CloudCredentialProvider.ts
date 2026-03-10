import { unlink } from "node:fs/promises";
import type { CredentialProvider } from "../../types";
import { writeTempAskpass } from "./askpass";

interface CachedToken {
	expiresAt: number;
	askpassPath: string;
}

export class CloudCredentialProvider implements CredentialProvider {
	private tokenFetcher: (
		remoteUrl: string,
	) => Promise<{ token: string; expiresAt: number }>;
	private cache = new Map<string, CachedToken>();

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

		const cached = this.cache.get(remoteUrl);
		if (cached && cached.expiresAt > Date.now()) {
			return {
				env: {
					GIT_ASKPASS: cached.askpassPath,
					GIT_TERMINAL_PROMPT: "0",
				},
			};
		}

		// Clean up old askpass file before writing a new one
		if (cached?.askpassPath) {
			unlink(cached.askpassPath).catch(() => {});
		}

		const { token, expiresAt } = await this.tokenFetcher(remoteUrl);
		const askpassPath = await writeTempAskpass(token);

		this.cache.set(remoteUrl, { expiresAt, askpassPath });

		return {
			env: {
				GIT_ASKPASS: askpassPath,
				GIT_TERMINAL_PROMPT: "0",
			},
		};
	}
}
