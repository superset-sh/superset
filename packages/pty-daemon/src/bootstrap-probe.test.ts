import { describe, expect, it } from "bun:test";
import {
	probeBootstrapHealthy,
	probeTrustdReachable,
	probeUserResolutionHealthy,
} from "./bootstrap-probe.ts";

const FAKE_BUNDLE = `-----BEGIN CERTIFICATE-----\nMIIFakeCertBytes\n-----END CERTIFICATE-----\n`;

describe("probeTrustdReachable", () => {
	it("returns true on non-darwin without running anything", async () => {
		let ran = false;
		const healthy = await probeTrustdReachable({
			platform: "linux",
			run: () => {
				ran = true;
				return { status: 1 };
			},
		});
		expect(healthy).toBe(true);
		expect(ran).toBe(false);
	});

	it("returns true when verify-cert exits 0 (trustd reachable)", async () => {
		expect(
			await probeTrustdReachable({
				platform: "darwin",
				readBundle: () => FAKE_BUNDLE,
				run: () => ({ status: 0 }),
			}),
		).toBe(true);
	});

	it("returns false when verify-cert exits non-zero (trustd unreachable)", async () => {
		expect(
			await probeTrustdReachable({
				platform: "darwin",
				readBundle: () => FAKE_BUNDLE,
				run: () => ({ status: 1 }),
			}),
		).toBe(false);
	});

	it("verifies the extracted cert (passes -c <file> to security verify-cert)", async () => {
		let cmd = "";
		let args: string[] = [];
		await probeTrustdReachable({
			platform: "darwin",
			readBundle: () => FAKE_BUNDLE,
			run: (c, a) => {
				cmd = c;
				args = a;
				return { status: 0 };
			},
		});
		expect(cmd).toBe("security");
		expect(args[0]).toBe("verify-cert");
		expect(args[1]).toBe("-c");
		expect(args[2]).toMatch(/superset-trustd-[^/]+\/probe\.pem$/);
	});

	it("finds the END marker after BEGIN when an earlier PEM type precedes it", async () => {
		// A "TRUSTED CERTIFICATE" block's END sits before the first plain
		// "BEGIN CERTIFICATE"; indexOf(END, begin) must skip it.
		const mixed =
			"-----BEGIN TRUSTED CERTIFICATE-----\nAAA\n-----END TRUSTED CERTIFICATE-----\n" +
			"-----BEGIN CERTIFICATE-----\nBBB\n-----END CERTIFICATE-----\n";
		let seenArgs: string[] = [];
		await probeTrustdReachable({
			platform: "darwin",
			readBundle: () => mixed,
			run: (_c, a) => {
				seenArgs = a;
				return { status: 0 };
			},
		});
		// Reached the run step (didn't bail on a bogus end<begin slice).
		expect(seenArgs[0]).toBe("verify-cert");
	});

	it("assumes healthy when the CA bundle has no cert (can't determine)", async () => {
		let ran = false;
		const healthy = await probeTrustdReachable({
			platform: "darwin",
			readBundle: () => "no certs here",
			run: () => {
				ran = true;
				return { status: 1 };
			},
		});
		expect(healthy).toBe(true);
		expect(ran).toBe(false);
	});

	it("assumes healthy when the probe throws (bundle unreadable)", async () => {
		expect(
			await probeTrustdReachable({
				platform: "darwin",
				readBundle: () => {
					throw new Error("ENOENT");
				},
				run: () => ({ status: 1 }),
			}),
		).toBe(true);
	});

	it("assumes healthy when the probe times out / errors (inconclusive)", async () => {
		expect(
			await probeTrustdReachable({
				platform: "darwin",
				readBundle: () => FAKE_BUNDLE,
				run: () => ({ status: null, error: new Error("ETIMEDOUT") }),
			}),
		).toBe(true);
	});

	it("assumes healthy when the probe is killed by a signal (status null)", async () => {
		expect(
			await probeTrustdReachable({
				platform: "darwin",
				readBundle: () => FAKE_BUNDLE,
				run: () => ({ status: null }),
			}),
		).toBe(true);
	});
});

describe("probeUserResolutionHealthy", () => {
	it("returns true on non-darwin without looking anything up", () => {
		let looked = false;
		const healthy = probeUserResolutionHealthy({
			platform: "linux",
			uid: 501,
			userInfo: () => {
				looked = true;
				throw new Error("no entry");
			},
		});
		expect(healthy).toBe(true);
		expect(looked).toBe(false);
	});

	it("returns true when the uid resolves to a username", () => {
		expect(
			probeUserResolutionHealthy({
				platform: "darwin",
				uid: 501,
				userInfo: () => ({ username: "kiet" }),
			}),
		).toBe(true);
	});

	it("returns false when getpwuid fails (userInfo throws)", () => {
		// The degraded-bootstrap signature: opendirectoryd unreachable, the
		// /etc/passwd fallback has no uid-501 entry, getpwuid_r finds nothing.
		expect(
			probeUserResolutionHealthy({
				platform: "darwin",
				uid: 501,
				userInfo: () => {
					throw new Error("ENOENT: no such user");
				},
			}),
		).toBe(false);
	});

	it("returns false when the username is just the bare uid", () => {
		// `id -un` printing `501` — the name never resolved.
		expect(
			probeUserResolutionHealthy({
				platform: "darwin",
				uid: 501,
				userInfo: () => ({ username: "501" }),
			}),
		).toBe(false);
	});

	it("returns false when the username is empty", () => {
		expect(
			probeUserResolutionHealthy({
				platform: "darwin",
				uid: 501,
				userInfo: () => ({ username: "" }),
			}),
		).toBe(false);
	});
});

describe("probeBootstrapHealthy", () => {
	const healthyTrustd = {
		readBundle: () => FAKE_BUNDLE,
		run: () => ({ status: 0 }),
	};

	it("is healthy only when both probes pass", async () => {
		expect(
			await probeBootstrapHealthy({
				platform: "darwin",
				...healthyTrustd,
				uid: 501,
				userInfo: () => ({ username: "kiet" }),
			}),
		).toBe(true);
	});

	it("is degraded when trustd is unreachable even if the user resolves", async () => {
		expect(
			await probeBootstrapHealthy({
				platform: "darwin",
				readBundle: () => FAKE_BUNDLE,
				run: () => ({ status: 1 }),
				uid: 501,
				userInfo: () => ({ username: "kiet" }),
			}),
		).toBe(false);
	});

	it("is degraded when the user doesn't resolve even if trustd answers", async () => {
		expect(
			await probeBootstrapHealthy({
				platform: "darwin",
				...healthyTrustd,
				uid: 501,
				userInfo: () => {
					throw new Error("no entry");
				},
			}),
		).toBe(false);
	});

	it("is healthy off darwin", async () => {
		expect(await probeBootstrapHealthy({ platform: "linux" })).toBe(true);
	});
});
