import { expect, test } from "bun:test";
import { assertSafeGitLabHost, isBlockedIP, trustedGitLabOrigin } from "./ssrf";

test("public IPv4 and IPv6 addresses are allowed including mapped public IPv4", () => {
	for (const ip of [
		"8.8.8.8",
		"1.1.1.1",
		"2606:4700:4700::1111",
		"2001:4860:4860::8888",
		"::ffff:8.8.8.8",
		"::ffff:808:808",
	])
		expect(isBlockedIP(ip)).toBe(false);
});
test("private, metadata, mapped, transition and non-global IPv4/IPv6 are blocked", () => {
	for (const ip of [
		"0.0.0.0",
		"10.0.0.1",
		"100.64.0.1",
		"127.0.0.1",
		"169.254.169.254",
		"172.16.0.1",
		"172.31.255.255",
		"192.168.1.1",
		"192.0.2.1",
		"198.18.0.1",
		"198.51.100.1",
		"203.0.113.1",
		"224.0.0.1",
		"255.255.255.255",
		"::",
		"::1",
		"fc00::1",
		"fd00:ec2::254",
		"fe80::1",
		"ff02::1",
		"::ffff:127.0.0.1",
		"::ffff:7f00:1",
		"::ffff:a00:1",
		"2001:db8::1",
		"2001::1",
		"2002:0808:0808::1",
		"3fff::1",
		"garbage",
		"999.1.1.1",
		"1.2.3",
		"127.1",
	])
		expect(isBlockedIP(ip)).toBe(true);
});
test("operator origin normalizes host/port but rejects protocol, credentials and IP literals", () => {
	expect(trustedGitLabOrigin("GIT.INTERNAL:8443")).toBe(
		"https://git.internal:8443",
	);
	expect(trustedGitLabOrigin("https://git.internal:8443/")).toBe(
		"https://git.internal:8443",
	);
	for (const value of [
		"http://git.internal",
		"https://user:pass@git.internal",
		"https://127.0.0.1",
		"https://[::1]",
		"https://git.internal/api",
		"https://git.internal?x=1",
		"https://git.internal#x",
		"https://git.internal\\@evil.test",
		"",
	])
		expect(trustedGitLabOrigin(value)).toBeNull();
});
test("host validation rejects mixed DNS answers and preserves custom HTTPS ports", async () => {
	expect(
		await assertSafeGitLabHost(
			"git.public:8443",
			async () => [{ address: "8.8.8.8", family: 4 }],
			null,
		),
	).toBe("https://git.public:8443");
	for (const addresses of [
		[],
		[
			{ address: "8.8.8.8", family: 4 },
			{ address: "127.0.0.1", family: 4 },
		],
		[{ address: "::ffff:7f00:1", family: 6 }],
		[{ address: "8.8.8.8", family: 6 }],
	])
		await expect(
			assertSafeGitLabHost("git.public", async () => addresses, null),
		).rejects.toThrow();
	await expect(
		assertSafeGitLabHost(
			"git.public",
			async () => {
				throw new Error("Resolver private diagnostic");
			},
			null,
		),
	).rejects.toThrow("did not resolve");
});
test("private DNS exception requires exact configured hostname origin including port", async () => {
	const resolve = async () => [{ address: "10.0.0.2", family: 4 }];
	expect(
		await assertSafeGitLabHost(
			"git.internal:8443",
			resolve,
			"https://git.internal:8443",
		),
	).toBe("https://git.internal:8443");
	for (const host of [
		"git.internal",
		"other.internal:8443",
		"127.0.0.1:8443",
		"[::1]:8443",
	])
		await expect(
			assertSafeGitLabHost(host, resolve, "https://git.internal:8443"),
		).rejects.toThrow();
});
