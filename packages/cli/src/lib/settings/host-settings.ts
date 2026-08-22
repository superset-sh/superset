import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CLIError } from "@superset/cli-framework";
import type { AppRouter as HostServiceRouter } from "@superset/host-service/trpc";
import type { BranchPrefixMode } from "@superset/local-db/schema/zod";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";
import { getSupersetHomeDir } from "./paths";

// Git settings live in the host service's host_settings table (the v2 store
// the desktop UI reads), not in local.db. The CLI reaches the local host
// service with the manifest auth token, so no cloud login is needed.

interface HostServiceManifest {
	pid: number;
	endpoint: string;
	authToken: string;
	organizationId: string;
}

function isProcessAlive(pid: number): boolean {
	if (!pid) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

const NOT_RUNNING = new CLIError(
	"The host service isn't running on this machine",
	"Launch the Superset desktop app or run: superset start",
);

/** Find a live host-service manifest, preferring the configured org. */
function findManifest(): HostServiceManifest {
	const home = getSupersetHomeDir();
	const orgIds: string[] = [];
	try {
		const config = JSON.parse(
			readFileSync(join(home, "config.json"), "utf-8"),
		) as { organizationId?: string };
		if (config.organizationId) orgIds.push(config.organizationId);
	} catch {}
	const hostDir = join(home, "host");
	if (existsSync(hostDir)) {
		for (const entry of readdirSync(hostDir)) {
			if (!orgIds.includes(entry)) orgIds.push(entry);
		}
	}
	for (const orgId of orgIds) {
		const path = join(hostDir, orgId, "manifest.json");
		if (!existsSync(path)) continue;
		try {
			const manifest = JSON.parse(
				readFileSync(path, "utf-8"),
			) as HostServiceManifest;
			if (
				manifest.endpoint &&
				manifest.authToken &&
				isProcessAlive(manifest.pid)
			) {
				return manifest;
			}
		} catch {}
	}
	throw NOT_RUNNING;
}

// Bound every host-service call: an unresponsive service (stale manifest,
// recycled pid, wedged process) must fail fast instead of hanging the CLI.
const HOST_REQUEST_TIMEOUT_MS = 5000;

function hostClient() {
	const manifest = findManifest();
	return createTRPCClient<HostServiceRouter>({
		links: [
			httpBatchLink({
				url: `${manifest.endpoint}/trpc`,
				transformer: SuperJSON,
				headers: { Authorization: `Bearer ${manifest.authToken}` },
				// cast: tRPC's FetchEsque disagrees with bun's Response typing
				fetch: ((input: Parameters<typeof fetch>[0], init?: RequestInit) =>
					fetch(input, {
						...init,
						signal: AbortSignal.timeout(HOST_REQUEST_TIMEOUT_MS),
					})) as Parameters<typeof httpBatchLink>[0]["fetch"],
			}),
		],
	});
}

/** Map transport/auth failures to actionable errors instead of raw tRPC dumps. */
async function callHost<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (error) {
		if (error instanceof CLIError) throw error;
		const message = error instanceof Error ? error.message : String(error);
		if (/UNAUTHORIZED|401/i.test(message)) {
			throw new CLIError(
				"The host service rejected the CLI's credentials",
				"The service may have restarted with new credentials. Run: superset start",
			);
		}
		throw new CLIError(
			`Could not reach the host service (${message.slice(0, 80)})`,
			"Launch the Superset desktop app or run: superset start",
		);
	}
}

export interface HostGitSettings {
	branchPrefixMode: BranchPrefixMode;
	branchPrefixCustom: string | null;
	worktreeBaseDir: string | null;
	defaultWorktreeBaseDir: string;
}

export async function readHostGitSettings(): Promise<HostGitSettings> {
	const client = hostClient();
	const [branchPrefix, worktreeLocation] = await callHost(() =>
		Promise.all([
			client.settings.branchPrefix.get.query(),
			client.settings.worktreeLocation.get.query(),
		]),
	);
	return {
		branchPrefixMode: branchPrefix.mode,
		branchPrefixCustom: branchPrefix.customPrefix,
		worktreeBaseDir: worktreeLocation.worktreeBaseDir,
		defaultWorktreeBaseDir: worktreeLocation.defaultWorktreeBaseDir,
	};
}

export async function writeHostGitSetting(
	key: "branchPrefixMode" | "branchPrefixCustom" | "worktreeBaseDir",
	value: string | null,
): Promise<void> {
	const client = hostClient();
	await callHost(async () => {
		if (key === "worktreeBaseDir") {
			await client.settings.worktreeLocation.set.mutate({ path: value });
			return;
		}
		const current = await client.settings.branchPrefix.get.query();
		await client.settings.branchPrefix.set.mutate(
			key === "branchPrefixMode"
				? {
						mode: (value ?? "none") as BranchPrefixMode,
						customPrefix: current.customPrefix,
					}
				: { mode: current.mode, customPrefix: value },
		);
	});
}
