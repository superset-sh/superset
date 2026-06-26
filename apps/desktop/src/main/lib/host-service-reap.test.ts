import { describe, expect, mock, test } from "bun:test";
import type { HostServiceManifest } from "./host-service-manifest";
import { type ReapDeps, reapPreviousHostService } from "./host-service-reap";

const ORG = "org-1";

function manifest(pid: number): HostServiceManifest {
	return {
		pid,
		endpoint: "http://127.0.0.1:48000",
		authToken: "secret",
		startedAt: 1,
		organizationId: ORG,
	};
}

function makeDeps(overrides: Partial<ReapDeps> = {}): ReapDeps {
	return {
		readManifest: mock(() => manifest(4242)),
		removeManifest: mock(() => {}),
		isProcessAlive: mock(() => true),
		killProcess: mock(() => {}),
		isOwnLivePid: mock(() => false),
		confirmOurHostService: mock(async () => true),
		// No real waiting in tests.
		sleep: mock(async () => {}),
		...overrides,
	};
}

describe("reapPreviousHostService", () => {
	test("no manifest → no-op", async () => {
		const deps = makeDeps({ readManifest: mock(() => null) });
		const result = await reapPreviousHostService(ORG, deps);
		expect(result.reason).toBe("no-manifest");
		expect(deps.killProcess).not.toHaveBeenCalled();
		expect(deps.removeManifest).not.toHaveBeenCalled();
	});

	test("pid we already own → left running, manifest kept", async () => {
		const deps = makeDeps({ isOwnLivePid: mock(() => true) });
		const result = await reapPreviousHostService(ORG, deps);
		expect(result.reason).toBe("own-live-instance");
		expect(deps.killProcess).not.toHaveBeenCalled();
		expect(deps.removeManifest).not.toHaveBeenCalled();
	});

	test("dead pid → manifest cleared, nothing killed", async () => {
		const deps = makeDeps({ isProcessAlive: mock(() => false) });
		const result = await reapPreviousHostService(ORG, deps);
		expect(result.reason).toBe("dead-pid-cleared");
		expect(deps.killProcess).not.toHaveBeenCalled();
		expect(deps.removeManifest).toHaveBeenCalledTimes(1);
	});

	test("alive but unidentified (PID reuse) → NOT killed, manifest dropped", async () => {
		const killProcess = mock(() => {});
		const deps = makeDeps({
			confirmOurHostService: mock(async () => false),
			killProcess,
		});
		const result = await reapPreviousHostService(ORG, deps);
		expect(result.reason).toBe("unidentified-left-alone");
		expect(killProcess).not.toHaveBeenCalled();
		expect(deps.removeManifest).toHaveBeenCalledTimes(1);
	});

	test("alive + ours + exits on SIGTERM → SIGTERM only, no SIGKILL", async () => {
		const signals: NodeJS.Signals[] = [];
		// Alive until SIGTERM is observed, then gone.
		let sigtermed = false;
		const deps = makeDeps({
			killProcess: mock((_pid: number, sig: NodeJS.Signals) => {
				signals.push(sig);
				if (sig === "SIGTERM") sigtermed = true;
			}),
			isProcessAlive: mock(() => !sigtermed),
		});
		const result = await reapPreviousHostService(ORG, deps);
		expect(result.reaped).toBe(true);
		expect(result.reason).toBe("terminated-sigterm");
		expect(signals).toEqual(["SIGTERM"]);
		expect(deps.removeManifest).toHaveBeenCalledTimes(1);
	});

	test("alive + ours + ignores SIGTERM → escalates to SIGKILL", async () => {
		const signals: NodeJS.Signals[] = [];
		let sigkilled = false;
		const deps = makeDeps({
			killProcess: mock((_pid: number, sig: NodeJS.Signals) => {
				signals.push(sig);
				if (sig === "SIGKILL") sigkilled = true;
			}),
			// Survives SIGTERM (always alive until SIGKILL lands).
			isProcessAlive: mock(() => !sigkilled),
		});
		const result = await reapPreviousHostService(ORG, deps);
		expect(result.reaped).toBe(true);
		expect(result.reason).toBe("terminated-sigkill");
		expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
		expect(deps.removeManifest).toHaveBeenCalledTimes(1);
	});
});
