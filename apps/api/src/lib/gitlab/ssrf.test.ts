import { describe, expect, it } from "bun:test";

import { assertSafeGitLabHost, isBlockedIP, SsrfError } from "./ssrf";

describe("isBlockedIP", () => {
	it("blocks IPv4 loopback / RFC-1918 / link-local / metadata / CGNAT / unspecified", () => {
		for (const ip of [
			"127.0.0.1",
			"10.0.0.1",
			"172.16.0.1",
			"172.31.255.255",
			"192.168.1.1",
			"169.254.169.254", // link-local + cloud metadata
			"100.64.0.1", // CGNAT
			"0.0.0.0",
		]) {
			expect(isBlockedIP(ip)).toBe(true);
		}
	});

	it("blocks IPv6 loopback / ULA / link-local / IPv4-mapped-private", () => {
		for (const ip of [
			"::1",
			"::",
			"fc00::1",
			"fd12:3456::1",
			"fe80::1",
			"::ffff:10.0.0.1",
		]) {
			expect(isBlockedIP(ip)).toBe(true);
		}
	});

	it("allows public IPs", () => {
		for (const ip of ["1.1.1.1", "8.8.8.8", "140.82.112.3"]) {
			expect(isBlockedIP(ip)).toBe(false);
		}
	});

	it("does not over-block just outside RFC-1918 (172.15 / 172.32)", () => {
		expect(isBlockedIP("172.15.0.1")).toBe(false);
		expect(isBlockedIP("172.32.0.1")).toBe(false);
	});

	it("blocks anything that is not a valid IP literal", () => {
		expect(isBlockedIP("not-an-ip")).toBe(true);
	});
});

describe("assertSafeGitLabHost", () => {
	it("rejects non-https schemes", async () => {
		await expect(
			assertSafeGitLabHost("http://gitlab.com"),
		).rejects.toBeInstanceOf(SsrfError);
	});

	it("rejects hosts that are literal private/loopback/metadata IPs (no DNS needed)", async () => {
		await expect(
			assertSafeGitLabHost("https://127.0.0.1"),
		).rejects.toBeInstanceOf(SsrfError);
		await expect(
			assertSafeGitLabHost("https://10.0.0.1"),
		).rejects.toBeInstanceOf(SsrfError);
		await expect(
			assertSafeGitLabHost("https://169.254.169.254"),
		).rejects.toBeInstanceOf(SsrfError);
	});

	it("rejects unparseable hosts", async () => {
		await expect(assertSafeGitLabHost("::: not a url")).rejects.toBeInstanceOf(
			SsrfError,
		);
	});

	it("allows a public IP literal and returns the normalized https origin", async () => {
		expect(await assertSafeGitLabHost("https://1.1.1.1")).toBe(
			"https://1.1.1.1",
		);
	});
});
