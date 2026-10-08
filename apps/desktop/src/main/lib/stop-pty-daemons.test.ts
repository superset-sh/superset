import { describe, expect, test } from "bun:test";
import type { PtyDaemonManifest } from "@superset/host-service/daemon-manifest";
import { type StopPtyDaemonsDeps, stopPtyDaemons } from "./stop-pty-daemons";

function daemonManifest(
	organizationId: string,
	pid: number,
): PtyDaemonManifest {
	return {
		pid,
		socketPath: `/tmp/${organizationId}.sock`,
		protocolVersions: [1],
		startedAt: 0,
		organizationId,
	};
}

function createHarness(overrides: Partial<StopPtyDaemonsDeps> = {}) {
	const alive = new Set<number>();
	const signals: Array<[number, NodeJS.Signals]> = [];
	const removed: string[] = [];
	const deps: Partial<StopPtyDaemonsDeps> = {
		listManifests: () => [],
		isHostServiceRunning: () => false,
		probe: async () => null,
		isAlive: (pid) => alive.has(pid),
		signalTree: (pid, signal) => {
			signals.push([pid, signal]);
			alive.delete(pid);
		},
		removeManifest: (manifest) => {
			removed.push(manifest.organizationId);
		},
		sleep: async () => {},
		hostServiceExitTimeoutMs: 1_000,
		daemonExitTimeoutMs: 1_000,
		...overrides,
	};
	return { alive, signals, removed, deps };
}

describe("stopPtyDaemons", () => {
	test("waits for the host-services to exit before it signals a daemon", async () => {
		const h = createHarness({
			listManifests: () => [daemonManifest("org-a", 500)],
			probe: async () => ({ daemonVersion: "1", daemonPid: 500 }),
		});
		h.alive.add(101);
		h.alive.add(500);
		let hostExitedBeforeSignal = false;
		h.deps.sleep = async () => {
			h.alive.delete(101);
		};
		const signalTree = h.deps.signalTree;
		h.deps.signalTree = (pid, signal) => {
			hostExitedBeforeSignal = !h.alive.has(101);
			signalTree?.(pid, signal);
		};

		await stopPtyDaemons([101], h.deps);

		expect(hostExitedBeforeSignal).toBe(true);
		expect(h.signals).toEqual([[500, "SIGTERM"]]);
		expect(h.removed).toEqual(["org-a"]);
	});

	test("leaves a daemon alone unless the socket names its pid and no host-service owns it", async () => {
		const h = createHarness({
			listManifests: () => [
				daemonManifest("other-instance", 600),
				daemonManifest("silent", 700),
				daemonManifest("no-pid", 750),
			],
			isHostServiceRunning: (organizationId) =>
				organizationId === "other-instance",
			probe: async (socketPath) =>
				socketPath.includes("no-pid") ? { daemonVersion: "1" } : null,
		});

		await stopPtyDaemons([], h.deps);

		expect(h.signals).toEqual([]);
		expect(h.removed).toEqual([]);
	});

	test("signals the pid that answers on the socket, not a recycled manifest pid", async () => {
		const h = createHarness({
			listManifests: () => [daemonManifest("org-a", 800)],
			probe: async () => ({ daemonVersion: "1", daemonPid: 801 }),
		});

		await stopPtyDaemons([], h.deps);

		expect(h.signals).toEqual([[801, "SIGTERM"]]);
	});

	test("escalates to SIGKILL when the daemon ignores SIGTERM", async () => {
		const h = createHarness({
			listManifests: () => [daemonManifest("org-a", 900)],
			probe: async () => ({ daemonVersion: "1", daemonPid: 900 }),
			daemonExitTimeoutMs: 0,
		});
		h.alive.add(900);
		h.deps.signalTree = (pid, signal) => {
			h.signals.push([pid, signal]);
			if (signal === "SIGKILL") h.alive.delete(pid);
		};

		await stopPtyDaemons([], h.deps);

		expect(h.signals).toEqual([
			[900, "SIGTERM"],
			[900, "SIGKILL"],
		]);
	});
});
