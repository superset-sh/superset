import { describe, expect, test } from "bun:test";
import type { HostServiceManifest } from "./manifest";
import { isManifestLive, verifyManifestOwner } from "./manifest-liveness";

function manifestFor(pid: number): HostServiceManifest {
	return {
		pid,
		endpoint: "http://127.0.0.1:1",
		authToken: "secret",
		startedAt: Date.now(),
		organizationId: "org-1",
	};
}

describe("isManifestLive", () => {
	test("dead pid is never live, regardless of identity checks", async () => {
		const inspectCommand = () => {
			throw new Error("must not be called for a dead pid");
		};
		const alive = await isManifestLive(manifestFor(999), {
			isAlive: () => false,
			inspectCommand,
		});
		expect(alive).toBe(false);
	});

	test("live pid running the host binary is live", async () => {
		const alive = await isManifestLive(manifestFor(42), {
			isAlive: () => true,
			inspectCommand: async () => "/opt/superset/bin/superset-host",
		});
		expect(alive).toBe(true);
	});

	test("live pid whose command belongs to an unrelated process is not live", async () => {
		const probeHealthy = () => {
			throw new Error(
				"must not fall back to a health probe when ps is conclusive",
			);
		};
		const alive = await isManifestLive(manifestFor(865), {
			isAlive: () => true,
			inspectCommand: async () => "/usr/libexec/some-unrelated-system-daemon",
			probeHealthy,
		});
		expect(alive).toBe(false);
	});
});

describe("verifyManifestOwner", () => {
	test("falls back to the authenticated health probe when the command can't be read", async () => {
		const alive = await verifyManifestOwner(manifestFor(42), {
			inspectCommand: async () => null,
			probeHealthy: async (endpoint, authToken) => {
				expect(endpoint).toBe("http://127.0.0.1:1");
				expect(authToken).toBe("secret");
				return true;
			},
		});
		expect(alive).toBe(true);
	});

	test("reports not-owned when both the command and the health probe fail to confirm", async () => {
		const alive = await verifyManifestOwner(manifestFor(42), {
			inspectCommand: async () => null,
			probeHealthy: async () => false,
		});
		expect(alive).toBe(false);
	});
});
