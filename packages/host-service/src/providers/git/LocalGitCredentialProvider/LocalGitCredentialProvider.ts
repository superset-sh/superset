import { execFile } from "node:child_process";
import { unlink } from "node:fs/promises";
import type {
	CredentialProblem,
	GitCredentialProvider,
} from "../../../runtime/git/types";
import { getToolEnvironment } from "../../../terminal/clean-shell-env";
import { writeTempAskpass } from "../askpass";
import { localCredentialRemedy, type TokenSource } from "./credential-remedy";

const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;

interface ResolvedToken {
	token: string;
	source: TokenSource;
	expiresAt: number;
}

export class LocalGitCredentialProvider implements GitCredentialProvider {
	private envResolver: () => Promise<Record<string, string>>;
	private cachedTokenByHost = new Map<string, ResolvedToken>();
	private inflightByHost = new Map<string, Promise<ResolvedToken | null>>();
	private cachedAskpass: { token: string; path: string } | null = null;

	constructor(
		envResolver: () => Promise<Record<string, string>> = getToolEnvironment,
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
		const cached = this.cachedTokenByHost.get(host);
		if (cached && cached.expiresAt > Date.now()) return cached.token;

		const inflight = this.inflightByHost.get(host);
		if (inflight) return (await inflight)?.token ?? null;

		const promise = this.fetchToken(host).finally(() => {
			this.inflightByHost.delete(host);
		});
		this.inflightByHost.set(host, promise);
		return (await promise)?.token ?? null;
	}

	/**
	 * Names the source of the token last resolved for `host`, ignoring its
	 * TTL — the caller is explaining a failure, not authenticating.
	 */
	credentialRemedy(host: string, problem: CredentialProblem): string {
		return localCredentialRemedy(
			problem,
			this.cachedTokenByHost.get(host)?.source ?? null,
		);
	}

	private async fetchToken(host: string): Promise<ResolvedToken | null> {
		const resolved = await this.lookupToken(host);
		// A failed lookup leaves the expired entry in place for
		// credentialRemedy, but must never hand that token back.
		if (!resolved) return null;
		const entry = { ...resolved, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS };
		this.cachedTokenByHost.set(host, entry);
		return entry;
	}

	private async lookupToken(
		host: string,
	): Promise<Omit<ResolvedToken, "expiresAt"> | null> {
		// GITHUB_TOKEN/GH_TOKEN are GitHub-specific; never replay them to
		// another host. Read from this process's env, not the login shell's:
		// the shell's tokens belong to the tools we spawn, not to us.
		// GH_TOKEN before GITHUB_TOKEN, the gh CLI's own precedence, so both
		// backends pick the same one when both variables are set.
		if (host === "github.com") {
			const { GITHUB_TOKEN, GH_TOKEN } = process.env;
			if (GH_TOKEN) return { token: GH_TOKEN, source: "env:GH_TOKEN" };
			if (GITHUB_TOKEN)
				return { token: GITHUB_TOKEN, source: "env:GITHUB_TOKEN" };
		}

		const env = await this.envResolver();

		const viaGit = await this.fetchTokenViaGitCredential(host);
		if (viaGit)
			return { token: viaGit, source: sourceOf(viaGit, env, "git-credential") };
		if (host !== "github.com") return null;

		const viaGh = await this.fetchTokenViaGhCli();
		if (!viaGh) return null;
		return { token: viaGh, source: sourceOf(viaGh, env, "gh-cli") };
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

/**
 * Both lookups run with the user's shell environment, and either can hand
 * back a token that came from GH_TOKEN/GITHUB_TOKEN rather than from
 * storage: `gh auth token` prefers those variables over its stored login,
 * and `credential.helper = gh auth git-credential` replays them. Blaming
 * storage would send the user to fix something the variable overrides.
 */
function sourceOf(
	token: string,
	env: Record<string, string>,
	storedSource: TokenSource,
): TokenSource {
	if (token === env.GH_TOKEN) return "env:GH_TOKEN";
	if (token === env.GITHUB_TOKEN) return "env:GITHUB_TOKEN";
	return storedSource;
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
