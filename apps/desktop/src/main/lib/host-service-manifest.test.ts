import { describe, expect, it, mock } from "bun:test";
import {
	type HostServiceManifest,
	shouldYieldManifest,
} from "./host-service-manifest";

function manifest(pid: number): HostServiceManifest {
	return {
		pid,
		endpoint: "http://127.0.0.1:55555",
		authToken: "holder-secret",
		startedAt: 0,
		organizationId: "org-1",
	};
}

const SELF_PID = 100;
const HOLDER_PID = 200;

function deps(overrides?: { alive?: boolean; healthy?: boolean }): {
	isAlive: ReturnType<typeof mock>;
	probeHealthy: ReturnType<typeof mock>;
} {
	return {
		isAlive: mock(() => overrides?.alive ?? true),
		probeHealthy: mock(() => Promise.resolve(overrides?.healthy ?? true)),
	};
}

describe("shouldYieldManifest", () => {
	it("yields to a live, healthy holder", async () => {
		const d = deps();
		expect(await shouldYieldManifest(manifest(HOLDER_PID), SELF_PID, d)).toBe(
			true,
		);
		expect(d.probeHealthy).toHaveBeenCalledWith(
			"http://127.0.0.1:55555",
			"holder-secret",
		);
	});

	it("claims when no manifest exists", async () => {
		const d = deps();
		expect(await shouldYieldManifest(null, SELF_PID, d)).toBe(false);
		expect(d.isAlive).not.toHaveBeenCalled();
		expect(d.probeHealthy).not.toHaveBeenCalled();
	});

	it("claims over its own prior manifest", async () => {
		const d = deps();
		expect(await shouldYieldManifest(manifest(SELF_PID), SELF_PID, d)).toBe(
			false,
		);
		expect(d.probeHealthy).not.toHaveBeenCalled();
	});

	it("claims from a dead holder without probing", async () => {
		const d = deps({ alive: false });
		expect(await shouldYieldManifest(manifest(HOLDER_PID), SELF_PID, d)).toBe(
			false,
		);
		expect(d.probeHealthy).not.toHaveBeenCalled();
	});

	it("claims from a live but unhealthy holder", async () => {
		const d = deps({ healthy: false });
		expect(await shouldYieldManifest(manifest(HOLDER_PID), SELF_PID, d)).toBe(
			false,
		);
		expect(d.probeHealthy).toHaveBeenCalled();
	});
});
