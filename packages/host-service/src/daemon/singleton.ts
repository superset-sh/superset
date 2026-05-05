// Singleton DaemonSupervisor for the host-service process. One supervisor
// per host-service instance; it manages exactly one daemon (per the org
// host-service was started with). Lazy bootstrap so tests can construct
// host-service without spawning a real daemon — the bootstrap is kicked
// off explicitly from `serve.ts`.

import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { DaemonSupervisor } from "./DaemonSupervisor.ts";

let supervisor: DaemonSupervisor | null = null;
let bootstrapPromise: Promise<unknown> | null = null;

/**
 * Resolve the daemon entry script path. In production, host-service.js and
 * pty-daemon.js are bundled side-by-side in the same dist directory. In
 * dev (running from source under bun), we fall back to the workspace
 * package's `dist/pty-daemon.js`. Either is fine — both are real Node
 * scripts.
 */
export function resolveSupervisorScriptPath(): string {
	const override = process.env.SUPERSET_PTY_DAEMON_SCRIPT_PATH;
	if (override) return override;

	const here = path.dirname(fileURLToPath(import.meta.url));
	// Production / dev (electron-vite bundle): host-service.js and
	// pty-daemon.js are emitted side-by-side in the same dist directory,
	// so `here` and the daemon entry share a parent.
	const sideBySide = path.resolve(here, "pty-daemon.js");
	if (existsSync(sideBySide)) return sideBySide;

	// Source-running fallback (`bun run` from packages/host-service):
	// `here` is `packages/host-service/src/daemon/`; the daemon's bundled
	// entry sits at `packages/pty-daemon/dist/pty-daemon.js` after
	// `bun run build:daemon` in that package.
	const workspaceDist = path.resolve(
		here,
		"..",
		"..",
		"..",
		"pty-daemon",
		"dist",
		"pty-daemon.js",
	);
	return workspaceDist;
}

export function getSupervisor(scriptPath?: string): DaemonSupervisor {
	if (!supervisor) {
		supervisor = new DaemonSupervisor({
			scriptPath: scriptPath ?? resolveSupervisorScriptPath(),
		});
	}
	return supervisor;
}

/**
 * Kick off `ensure(orgId)` without awaiting (per the host-service
 * migration plan, decision D3 — fire-and-track). Stash the promise so
 * callers that need the daemon up can await it via `waitForDaemonReady`.
 */
export function startDaemonBootstrap(organizationId: string): void {
	if (bootstrapPromise) return;
	const sup = getSupervisor();
	console.log(`[supervisor] kicking off bootstrap for org=${organizationId}`);
	bootstrapPromise = sup
		.ensure(organizationId)
		.then((inst) => {
			console.log(
				`[supervisor] bootstrap OK for org=${organizationId} pid=${inst.pid} version=${inst.runningVersion}${inst.updatePending ? " (update pending)" : ""}`,
			);
			return inst;
		})
		.catch((err) => {
			console.error(
				`[supervisor] bootstrap failed for org=${organizationId}:`,
				err,
			);
			// Reset so a future request can retry.
			bootstrapPromise = null;
			throw err;
		});
}

/**
 * Awaits the in-flight bootstrap. If bootstrap hasn't started, kicks one
 * off first. Terminal request handlers call this before using the
 * supervisor's socket path.
 */
export async function waitForDaemonReady(
	organizationId: string,
): Promise<void> {
	if (!bootstrapPromise) startDaemonBootstrap(organizationId);
	if (bootstrapPromise) {
		await bootstrapPromise;
	}
}

/** Test-only — reset the singleton between tests. */
export function __resetSupervisorForTesting(): void {
	supervisor = null;
	bootstrapPromise = null;
}
