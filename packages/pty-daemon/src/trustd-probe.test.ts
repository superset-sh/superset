import { describe, expect, it } from "bun:test";
import { probeTrustdHealthy } from "./trustd-probe.ts";

const FAKE_BUNDLE = `-----BEGIN CERTIFICATE-----\nMIIFakeCertBytes\n-----END CERTIFICATE-----\n`;

describe("probeTrustdHealthy", () => {
	it("returns true on non-darwin without running anything", () => {
		let ran = false;
		const healthy = probeTrustdHealthy({
			platform: "linux",
			run: () => {
				ran = true;
				return { status: 1 };
			},
		});
		expect(healthy).toBe(true);
		expect(ran).toBe(false);
	});

	it("returns true when verify-cert exits 0 (trustd reachable)", () => {
		expect(
			probeTrustdHealthy({
				platform: "darwin",
				readBundle: () => FAKE_BUNDLE,
				run: () => ({ status: 0 }),
			}),
		).toBe(true);
	});

	it("returns false when verify-cert exits non-zero (trustd unreachable)", () => {
		expect(
			probeTrustdHealthy({
				platform: "darwin",
				readBundle: () => FAKE_BUNDLE,
				run: () => ({ status: 1 }),
			}),
		).toBe(false);
	});

	it("verifies the extracted cert (passes -c <file> to security verify-cert)", () => {
		let cmd = "";
		let args: string[] = [];
		probeTrustdHealthy({
			platform: "darwin",
			readBundle: () => FAKE_BUNDLE,
			pid: 999,
			run: (c, a) => {
				cmd = c;
				args = a;
				return { status: 0 };
			},
		});
		expect(cmd).toBe("security");
		expect(args[0]).toBe("verify-cert");
		expect(args[1]).toBe("-c");
		expect(args[2]).toMatch(/superset-trustd-probe-999\.pem$/);
	});

	it("assumes healthy when the CA bundle has no cert (can't determine)", () => {
		let ran = false;
		const healthy = probeTrustdHealthy({
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

	it("assumes healthy when the probe throws (bundle unreadable)", () => {
		expect(
			probeTrustdHealthy({
				platform: "darwin",
				readBundle: () => {
					throw new Error("ENOENT");
				},
				run: () => ({ status: 1 }),
			}),
		).toBe(true);
	});

	it("assumes healthy when the probe times out / errors (inconclusive)", () => {
		expect(
			probeTrustdHealthy({
				platform: "darwin",
				readBundle: () => FAKE_BUNDLE,
				run: () => ({ status: null, error: new Error("ETIMEDOUT") }),
			}),
		).toBe(true);
	});

	it("assumes healthy when the probe is killed by a signal (status null)", () => {
		expect(
			probeTrustdHealthy({
				platform: "darwin",
				readBundle: () => FAKE_BUNDLE,
				run: () => ({ status: null }),
			}),
		).toBe(true);
	});
});
