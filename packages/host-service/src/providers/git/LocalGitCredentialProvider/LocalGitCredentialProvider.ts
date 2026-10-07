import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type {
	CredentialProblem,
	GitCredentialProvider,
} from "../../../runtime/git/types";
import { getToolEnvironment } from "../../../terminal/clean-shell-env";
import { writeTempAskpass } from "../askpass";
import { localCredentialRemedy, type TokenSource } from "./credential-remedy";

const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const GITLAB_TOKEN_VARIABLES = [
	"GITLAB_TOKEN",
	"GITLAB_ACCESS_TOKEN",
	"OAUTH_TOKEN",
] as const;

const execFileAsync = promisify(execFile);

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
			host,
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
			return {
				token: viaGit,
				source: sourceOf(viaGit, env, "git-credential", host),
			};
		if (host !== "github.com") return this.fetchTokenViaGlabCli(host, env);

		const viaGh = await this.fetchTokenViaGhCli();
		if (!viaGh) return null;
		return { token: viaGh, source: sourceOf(viaGh, env, "gh-cli", host) };
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
		// Launched from a terminal with no credential helper, git would prompt
		// on the tty and sit there until the timeout.
		const env = { ...(await this.envResolver()), GIT_TERMINAL_PROMPT: "0" };
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
			// git can exit before reading its input (EPIPE); the callback
			// above already reports that.
			child.stdin?.on("error", () => {});
			child.stdin?.write(`protocol=https\nhost=${host}\n\n`);
			child.stdin?.end();
		});
	}

	private async fetchTokenViaGlabCli(
		host: string,
		env: Record<string, string>,
	): Promise<Omit<ResolvedToken, "expiresAt"> | null> {
		const envHost = normalizeGitLabHost(
			env.GITLAB_HOST || env.GITLAB_URI || env.GL_HOST || "gitlab.com",
		);
		if (host === envHost) {
			for (const name of GITLAB_TOKEN_VARIABLES) {
				if (env[name]) {
					const token = validGitLabToken(env[name]);
					return token ? { token, source: `env:${name}` } : null;
				}
			}
		}

		const glabEnv: Record<string, string> = {
			...env,
			GLAB_SHOW_WHATS_NEW: "false",
			GLAB_SEND_TELEMETRY: "false",
			GLAB_CHECK_UPDATE: "false",
			CHECK_UPDATE: "false",
		};
		if (glabEnv.GLAB_CONFIG_DIR)
			glabEnv.GLAB_CONFIG_DIR = resolve(glabEnv.GLAB_CONFIG_DIR);
		for (const name of GITLAB_TOKEN_VARIABLES) delete glabEnv[name];
		for (const name of Object.keys(glabEnv))
			if (name.startsWith("GIT_")) delete glabEnv[name];
		let directory: string | undefined;
		try {
			directory = await mkdtemp(join(tmpdir(), "superset-glab-"));
			const gitDir = join(directory, ".git");
			await Promise.all([
				mkdir(join(gitDir, "objects"), { recursive: true, mode: 0o700 }),
				mkdir(join(gitDir, "refs"), { recursive: true, mode: 0o700 }),
				mkdir(join(gitDir, "glab-cli"), { recursive: true, mode: 0o700 }),
			]);
			const fallback = randomUUID();
			await Promise.all([
				writeFile(join(directory, "gitconfig"), "", { mode: 0o600 }),
				writeFile(join(gitDir, "HEAD"), "ref: refs/heads/main\n", {
					mode: 0o600,
				}),
				writeFile(
					join(gitDir, "glab-cli", "config.yml"),
					`token: ${fallback}\n`,
					{ mode: 0o600 },
				),
			]);
			// glab resolves host/keyring first, then this private local fallback.
			const { stdout } = await execFileAsync(
				"glab",
				["config", "get", "token", "--host", host],
				{
					timeout: 10_000,
					cwd: directory,
					env: {
						...glabEnv,
						GIT_DIR: gitDir,
						GIT_COMMON_DIR: gitDir,
						GIT_WORK_TREE: directory,
						GIT_CONFIG_NOSYSTEM: "1",
						GIT_CONFIG_GLOBAL: join(directory, "gitconfig"),
					},
				},
			);
			const token = validGitLabToken(stdout.trim());
			return token && token !== fallback ? { token, source: "glab-cli" } : null;
		} catch {
			return null;
		} finally {
			if (directory)
				await rm(directory, { recursive: true, force: true }).catch(() => {});
		}
	}

	private async fetchTokenViaGhCli(): Promise<string | null> {
		const env = await this.envResolver();
		try {
			const { stdout } = await execFileAsync("gh", ["auth", "token"], {
				timeout: 10_000,
				env,
			});
			return stdout.trim() || null;
		} catch {
			return null;
		}
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
	host: string,
): TokenSource {
	if (host === "github.com") {
		if (token === env.GH_TOKEN) return "env:GH_TOKEN";
		if (token === env.GITHUB_TOKEN) return "env:GITHUB_TOKEN";
	} else {
		for (const name of GITLAB_TOKEN_VARIABLES) {
			if (token === env[name]) return `env:${name}`;
		}
	}
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

function normalizeGitLabHost(value: string): string | null {
	if (/\s/.test(value)) return null;
	try {
		const url = new URL(value.includes("://") ? value : `https://${value}`);
		return (url.protocol === "https:" || url.protocol === "http:") &&
			!url.username &&
			!url.password
			? url.host
			: null;
	} catch {
		return null;
	}
}

function validGitLabToken(value: string | null | undefined): string | null {
	if (
		!value ||
		!/^[A-Za-z0-9_.=-]+$/.test(value) ||
		/^(usage|help|glab)$/i.test(value)
	)
		return null;
	return value;
}
