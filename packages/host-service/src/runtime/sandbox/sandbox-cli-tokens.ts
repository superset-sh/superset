import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getWorkspaceSandboxPaths } from "./paths.ts";

/**
 * Per-workspace tokens the bundled `superset` CLI uses from INSIDE a
 * sandbox container. The org PSK never enters the container; instead each
 * workspace gets a random token written to
 * `<sandbox-state>/host/token` (0600) and mounted read-only at
 * /opt/superset/host/token. PskHostAuthProvider accepts registered sandbox
 * tokens alongside the PSK; a token is revoked by destroying the sandbox.
 *
 * The registry is in-memory and repopulated on every container ensure, so
 * tokens survive host-service restarts as long as the workspace is used.
 */

const cliTokens = new Map<string, string>();

export interface CliTokenMount {
	/** Host directory to bind-mount read-only at /opt/superset/host. */
	hostDir: string;
}

export async function ensureCliTokenFile(
	workspaceId: string,
): Promise<CliTokenMount> {
	const hostDir = join(getWorkspaceSandboxPaths(workspaceId).stateDir, "host");
	await mkdir(hostDir, { recursive: true });
	const tokenPath = join(hostDir, "token");
	let token: string;
	if (existsSync(tokenPath)) {
		token = (await readFile(tokenPath, "utf-8")).trim();
	} else {
		token = randomBytes(32).toString("hex");
		await writeFile(tokenPath, `${token}\n`, { mode: 0o600 });
	}
	cliTokens.set(workspaceId, token);
	return { hostDir };
}

/**
 * The workspace a sandbox CLI token belongs to, or null if it matches none.
 * Timing-safe: compares against every registered token with no early exit, so
 * the work is independent of match position.
 */
export function resolveSandboxTokenWorkspace(presented: string): string | null {
	const presentedBuffer = Buffer.from(presented);
	let match: string | null = null;
	for (const [workspaceId, token] of cliTokens.entries()) {
		const tokenBuffer = Buffer.from(token);
		if (
			presentedBuffer.length === tokenBuffer.length &&
			timingSafeEqual(presentedBuffer, tokenBuffer)
		) {
			match = workspaceId;
		}
	}
	return match;
}

/** Timing-safe check against every registered sandbox CLI token. */
export function isValidSandboxCliToken(presented: string): boolean {
	return resolveSandboxTokenWorkspace(presented) !== null;
}

export function dropCliToken(workspaceId: string): void {
	cliTokens.delete(workspaceId);
}

export function resetCliTokensForTests(): void {
	cliTokens.clear();
}
