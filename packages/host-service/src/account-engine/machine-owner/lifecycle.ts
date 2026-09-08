import { spawn } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	assertIsolatedDaemonNamespaceInTests,
	isTestRunnerContext,
} from "../../daemon/manifest.ts";

export interface OwnerManifest {
	pid: number;
	port: number;
	token: string;
	version: 1;
}
export function ownerManifestPath(): string {
	assertIsolatedDaemonNamespaceInTests();
	return join(
		process.env.SUPERSET_HOME_DIR?.trim() || join(homedir(), ".superset"),
		"state",
		"account-engine",
		"owner.json",
	);
}

export function readOwnerManifest(): OwnerManifest | null {
	try {
		const path = ownerManifestPath();
		const stat = lstatSync(path);
		if (
			!stat.isFile() ||
			(process.platform !== "win32" &&
				((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()))
		)
			return null;
		const value = JSON.parse(readFileSync(path, "utf8")) as OwnerManifest;
		if (
			value.version !== 1 ||
			!Number.isInteger(value.pid) ||
			value.pid <= 0 ||
			!Number.isInteger(value.port) ||
			value.port < 1 ||
			value.port > 65535 ||
			typeof value.token !== "string" ||
			value.token.length !== 64
		)
			return null;
		process.kill(value.pid, 0);
		return value;
	} catch {
		return null;
	}
}

export function resolveOwnerScript(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	const bundled = join(here, "account-owner.js");
	if (existsSync(bundled)) return bundled;
	// Vite may extract this shared module into dist/main/chunks/.
	const chunkSibling = join(here, "..", "account-owner.js");
	if (existsSync(chunkSibling)) return chunkSibling;
	const source = join(here, "entry.ts");
	if (process.versions.bun && existsSync(source)) return source;
	const dist = resolve(here, "../../../dist/account-owner.js");
	if (existsSync(dist)) return dist;
	throw new Error("account-owner-bundle-missing");
}

/** Same persistent child-process pattern as the PTY daemon. Concurrent
 * spawners are harmless: only the engine lease winner publishes an endpoint. */
export function spawnAccountOwner(): void {
	if (isTestRunnerContext())
		throw new Error(
			"Tests must start an in-process account owner explicitly; automatic subprocess spawning is disabled.",
		);
	assertIsolatedDaemonNamespaceInTests();
	const child = spawn(process.execPath, [resolveOwnerScript()], {
		detached: true,
		stdio: "ignore",
		env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", HOST_PARENT_PID: "" },
	});
	child.once("error", (error) =>
		console.warn("[account-owner] spawn failed", error),
	);
	child.unref();
}
