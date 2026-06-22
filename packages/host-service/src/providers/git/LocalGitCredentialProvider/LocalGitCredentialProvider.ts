import { execFile } from "node:child_process";
import { unlink } from "node:fs/promises";
import type { GitCredentialProvider } from "../../../runtime/git/types";
import { writeTempAskpass } from "../askpass";

const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;

export class LocalGitCredentialProvider implements GitCredentialProvider {
	private envResolver: () => Promise<Record<string, string>>;
	private cachedTokenByHost = new Map<
		string,
		{ token: string; expiresAt: number }
	>();
	private inflightByHost = new Map<string, Promise<string | null>>();
	private cachedAskpass: { token: string; path: string } | null = null;

	constructor(
		envResolver: () => Promise<Record<string, string>> = async () =>
			process.env as Record<string, string>,
	) {
		this.envResolver = envResolver;
	}

	async getCredentials(
		remoteUrl: string | null,
	): Promise<{ env: Record<string, string> }> {
		const env: Record<string, string> = {
			...(await this.envResolver()),
			GIT_TERMINAL_PROMPT: "0",
		};

		const host = httpsHost(remoteUrl);
		if (!host) return { env };

		const token = await this.getToken(host);
		if (token) env.GIT_ASKPASS = await this.askpassFor(token);
		return { env };
	}

	async getToken(host: string): Promise<string | null> {
		// GITHUB_TOKEN/GH_TOKEN are GitHub-specific; never replay them to another host.
		if (host === "github.com") {
			const envToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
			if (envToken) return envToken;
		}

		const cached = this.cachedTokenByHost.get(host);
		if (cached && cached.expiresAt > Date.now()) return cached.token;

		const inflight = this.inflightByHost.get(host);
		if (inflight) return inflight;

		const promise = this.fetchToken(host).finally(() => {
			this.inflightByHost.delete(host);
		});
		this.inflightByHost.set(host, promise);
		return promise;
	}

	private async fetchToken(host: string): Promise<string | null> {
		const token =
			(await this.fetchTokenViaGitCredential(host)) ??
			(host === "github.com" ? await this.fetchTokenViaGhCli() : null);
		if (token) {
			this.cachedTokenByHost.set(host, {
				token,
				expiresAt: Date.now() + TOKEN_CACHE_TTL_MS,
			});
		}
		return token;
	}

	private async askpassFor(token: string): Promise<string> {
		if (this.cachedAskpass?.token === token) return this.cachedAskpass.path;
		if (this.cachedAskpass) {
			unlink(this.cachedAskpass.path).catch(() => {});
		}
		const path = await writeTempAskpass(token);
		this.cachedAskpass = { token, path };
		return path;
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
					resolve(match?.[1]?.trim() ?? null);
				},
			);
			child.stdin?.write(`protocol=https\nhost=${host}\n\n`);
			child.stdin?.end();
		});
	}

	private async fetchTokenViaGhCli(): Promise<string | null> {
		const env = await this.envResolver();
		return new Promise((resolve) => {
			execFile(
				"gh",
				["auth", "token"],
				{ timeout: 10_000, env },
				(error, stdout) => {
					resolve(error ? null : stdout.trim() || null);
				},
			);
		});
	}
}

function httpsHost(remoteUrl: string | null): string | null {
	if (!remoteUrl) return null;
	try {
		const url = new URL(remoteUrl);
		return url.protocol === "https:" ? url.host : null;
	} catch {
		return null;
	}
}
