import { execFile } from "node:child_process";
import type { GitCredentialProvider } from "../../../../runtime/git/types";
import { getStrictShellEnvironment } from "../../../../terminal/clean-shell-env";

const LS_REMOTE_TIMEOUT_MS = 15_000;
const GH_STATUS_TIMEOUT_MS = 10_000;

export type CloneAccessReason = "auth" | "not_found" | "network" | "unknown";

export type GhCliStatus = "authenticated" | "unauthenticated" | "not_installed";

export interface CloneAccessResult {
	ok: boolean;
	reason?: CloneAccessReason;
	/** First meaningful stderr line from git, for diagnostics. */
	detail?: string;
	ghCli: GhCliStatus;
}

const AUTH_PATTERNS = [
	"could not read Username",
	"could not read Password",
	"terminal prompts disabled",
	"Authentication failed",
	"Permission denied (publickey)",
	"Invalid username or",
	"returned error: 403",
	"returned error: 401",
];

const NOT_FOUND_PATTERNS = ["Repository not found", "returned error: 404"];

const NETWORK_PATTERNS = [
	"Could not resolve host",
	"Failed to connect",
	"Connection refused",
	"Connection timed out",
	"Operation timed out",
	"Network is unreachable",
	"SSL_ERROR",
	"GnuTLS",
];

export function classifyGitFailure(message: string): CloneAccessReason {
	if (AUTH_PATTERNS.some((pattern) => message.includes(pattern))) return "auth";
	if (NOT_FOUND_PATTERNS.some((pattern) => message.includes(pattern))) {
		return "not_found";
	}
	if (NETWORK_PATTERNS.some((pattern) => message.includes(pattern))) {
		return "network";
	}
	return "unknown";
}

function firstMeaningfulLine(message: string): string | undefined {
	return message
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 0);
}

async function probeLsRemote(
	repoCloneUrl: string,
	credentials: GitCredentialProvider | undefined,
): Promise<{ ok: boolean; reason?: CloneAccessReason; detail?: string }> {
	const env = credentials
		? (await credentials.getCredentials(repoCloneUrl)).env
		: {
				...(await getStrictShellEnvironment().catch(
					() => process.env as Record<string, string>,
				)),
				GIT_TERMINAL_PROMPT: "0",
			};

	return new Promise((resolve) => {
		execFile(
			"git",
			["ls-remote", repoCloneUrl, "HEAD"],
			{ timeout: LS_REMOTE_TIMEOUT_MS, env, encoding: "utf8" },
			(error, _stdout, stderr) => {
				if (!error) {
					resolve({ ok: true });
					return;
				}
				if ((error as NodeJS.ErrnoException).code === "ENOENT") {
					resolve({
						ok: false,
						reason: "unknown",
						detail: "git executable not found on this host",
					});
					return;
				}
				if (error.killed) {
					resolve({
						ok: false,
						reason: "network",
						detail: `Timed out reaching the remote after ${LS_REMOTE_TIMEOUT_MS / 1000}s`,
					});
					return;
				}
				const message = stderr || error.message;
				resolve({
					ok: false,
					reason: classifyGitFailure(message),
					detail: firstMeaningfulLine(stderr) ?? firstMeaningfulLine(message),
				});
			},
		);
	});
}

async function probeGhCli(): Promise<GhCliStatus> {
	const env = await getStrictShellEnvironment().catch(
		() => process.env as Record<string, string>,
	);
	return new Promise((resolve) => {
		execFile(
			"gh",
			["auth", "status", "--hostname", "github.com"],
			{ timeout: GH_STATUS_TIMEOUT_MS, env, encoding: "utf8" },
			(error) => {
				if (!error) {
					resolve("authenticated");
					return;
				}
				resolve(
					(error as NodeJS.ErrnoException).code === "ENOENT"
						? "not_installed"
						: "unauthenticated",
				);
			},
		);
	});
}

/**
 * Answers "would a clone of this URL work from this host?" without cloning:
 * `git ls-remote` with the same credential env the real clone uses, plus the
 * gh CLI's auth state so the client can render precise remediation.
 */
export async function checkCloneAccess(
	repoCloneUrl: string,
	credentials: GitCredentialProvider | undefined,
): Promise<CloneAccessResult> {
	const [remote, ghCli] = await Promise.all([
		probeLsRemote(repoCloneUrl, credentials),
		probeGhCli(),
	]);
	return { ...remote, ghCli };
}
