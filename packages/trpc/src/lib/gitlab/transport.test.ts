import { expect, test } from "bun:test";
import { resolveGitLabRequest, safeGitLabFetch } from "./transport";

const publicDns = async () => [{ address: "8.8.8.8", family: 4 }];
test("resolved request keeps the exact validated address set and custom HTTPS port", async () => {
	const result = await resolveGitLabRequest(
		"https://GIT.PUBLIC:8443/api/v4/user",
		publicDns,
		null,
	);
	expect(result.url.origin).toBe("https://git.public:8443");
	expect(result.addresses).toEqual([{ address: "8.8.8.8", family: 4 }]);
});
test("every DNS answer must be safe and have a valid matching address family", async () => {
	for (const addresses of [
		[],
		[
			{ address: "8.8.8.8", family: 4 },
			{ address: "::ffff:7f00:1", family: 6 },
		],
		[{ address: "8.8.8.8", family: 6 }],
		[{ address: "bad", family: 4 }],
	])
		await expect(
			resolveGitLabRequest(
				"https://git.public/api/v4/user",
				async () => addresses,
				null,
			),
		).rejects.toThrow();
});
test("exact private issuer exception still resolves and cannot allow metadata or malformed addresses", async () => {
	expect(
		(
			await resolveGitLabRequest(
				"https://git.internal:8443/api/v4/user",
				async () => [{ address: "10.0.0.1", family: 4 }],
				"https://git.internal:8443",
			)
		).addresses,
	).toEqual([{ address: "10.0.0.1", family: 4 }]);
	for (const address of [
		"169.254.169.254",
		"::ffff:a9fe:a9fe",
		"fd00:ec2::254",
		"bad",
	])
		await expect(
			resolveGitLabRequest(
				"https://git.internal:8443/api/v4/user",
				async () => [{ address, family: address.includes(":") ? 6 : 4 }],
				"https://git.internal:8443",
			),
		).rejects.toThrow();
	await expect(
		resolveGitLabRequest(
			"https://git.internal:8443/api/v4/user",
			async () => {
				throw new Error("DNS failed");
			},
			"https://git.internal:8443",
		),
	).rejects.toThrow("did not resolve");
	await expect(
		resolveGitLabRequest(
			"https://git.internal/api/v4/user",
			async () => [{ address: "10.0.0.1", family: 4 }],
			"https://git.internal:8443",
		),
	).rejects.toThrow();
});
test("transport rejects unsafe protocols, userinfo, fragments, and raw backslashes", async () => {
	for (const url of [
		"http://git.public/api/v4/user",
		"https://user:pass@git.public/api/v4/user",
		"https://git.public/api/v4/user#fragment",
		"https://git.public\\@evil.test/api/v4/user",
		"file:///tmp/example",
	])
		await expect(resolveGitLabRequest(url, publicDns, null)).rejects.toThrow();
});
test("invalid request bodies and Host override fail before any socket is opened", async () => {
	for (const init of [
		{ body: new FormData() },
		{ headers: { Host: "other.internal" } },
	])
		await expect(
			safeGitLabFetch("https://git.public/api/v4/user", init, {
				resolve: publicDns,
				issuer: null,
				request: () => {
					throw new Error("Unsafe socket opened");
				},
			}),
		).rejects.toThrow(/Unsupported|header/);
});
