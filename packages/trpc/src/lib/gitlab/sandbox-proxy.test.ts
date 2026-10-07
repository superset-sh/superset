import { afterAll, describe, expect, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { createGitlabSandboxProxy } from "./sandbox-proxy";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = {
	...keys.publicKey.export({ format: "jwk" }),
	kid: "fake-owned-key",
	alg: "RS256",
	use: "sig",
};
const originalFetch = globalThis.fetch;
let keyRequests = 0;
let unblockKeys: (() => void) | undefined;
let keysRequested: (() => void) | undefined;
globalThis.fetch = (async (url: string | URL | Request) => {
	if (
		![
			"https://oidc.vercel.com/fake-owned-team/.well-known/jwks",
			"https://oidc.vercel.com/fake-owned-cancel-team/.well-known/jwks",
		].includes(String(url))
	)
		throw new Error("Unexpected provider request");
	if (String(url).includes("fake-owned-cancel-team")) {
		keysRequested?.();
		await new Promise<void>((resolve) => {
			unblockKeys = resolve;
		});
	}
	keyRequests++;
	return Response.json({ keys: [jwk] });
}) as typeof fetch;
afterAll(() => {
	globalThis.fetch = originalFetch;
});
const config = {
	issuer: "https://oidc.vercel.com/fake-owned-team",
	forwardURL: "https://broker.example.com/gitlab",
	teamId: "team_fake_owned",
	projectId: "prj_fake_owned",
};
const baseClaims = () => ({
	iss: config.issuer,
	aud: config.forwardURL,
	iat: Math.floor(Date.now() / 1000),
	exp: Math.floor(Date.now() / 1000) + 300,
	team_id: config.teamId,
	project_id: config.projectId,
	sandbox_id: "sbx_fake_owned",
	sandbox_name: "superset-fake-owned",
});
function token(claims: Record<string, unknown>) {
	const header = Buffer.from(
		JSON.stringify({ alg: "RS256", kid: jwk.kid }),
	).toString("base64url");
	const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
	const input = `${header}.${body}`;
	return `${input}.${sign("RSA-SHA256", Buffer.from(input), keys.privateKey).toString("base64url")}`;
}
function request(
	claims: Record<string, unknown> = baseClaims(),
	extra: Record<string, string> = {},
) {
	return new Request(
		"https://broker.example.com/gitlab/api/v4/projects/7?x=1",
		{
			method: "POST",
			body: "fake-body",
			headers: {
				"vercel-forwarded-host": "gitlab.example.com",
				"vercel-forwarded-scheme": "https",
				"vercel-forwarded-port": "443",
				"vercel-forwarded-path": "/api/v4/projects/7?x=1",
				"vercel-sandbox-oidc-token": token(claims),
				...extra,
			},
		},
	);
}
const proxy = createGitlabSandboxProxy(config, async (req, identity, raw) =>
	Response.json({
		identity,
		raw,
		method: req.method,
		body: await req.text(),
		headers: [...req.headers.keys()],
	}),
);
describe("GitLab sandbox forwarding authentication", () => {
	test.each([
		"release%25name",
		"feature%252Fone",
	])("preserves a correctly encoded literal percent branch %s", async (ref) => {
		const raw = `/api/v4/projects/7/repository/branches/${ref}`;
		const headers = request().headers;
		headers.set("vercel-forwarded-path", raw);
		const response = await proxy(
			new Request(config.forwardURL, {
				method: "POST",
				body: "fake-body",
				headers,
			}),
		);
		expect(response.status).toBe(200);
		expect((await response.json()).raw.path).toBe(raw);
	});
	test.each([
		"release%name",
		"feature%255cname",
	])("rejects malformed or nested structural percent branch %s", async (ref) => {
		const headers = request().headers;
		headers.set(
			"vercel-forwarded-path",
			`/api/v4/projects/7/repository/branches/${ref}`,
		);
		expect(
			(
				await proxy(
					new Request(config.forwardURL, {
						method: "POST",
						body: "fake-body",
						headers,
					}),
				)
			).status,
		).toBe(403);
	});
	test("verifies both framework URL forms when raw path equals the broker path", async () => {
		for (const incoming of [config.forwardURL, `${config.forwardURL}/gitlab`]) {
			const headers = request().headers;
			headers.set("vercel-forwarded-path", "/gitlab");
			const response = await proxy(
				new Request(incoming, { method: "POST", body: "fake-body", headers }),
			);
			expect(response.status).toBe(200);
			expect((await response.json()).raw.path).toBe("/gitlab");
		}
	});
	test("never dispatches an already aborted input", async () => {
		const abort = new AbortController();
		abort.abort();
		let calls = 0;
		const closed = createGitlabSandboxProxy(config, async () => {
			calls++;
			return new Response("unexpected");
		});
		const response = await closed(
			new Request(request(), { signal: abort.signal }),
		);
		expect(response.status).toBe(403);
		expect(calls).toBe(0);
	});
	test("settles abort during genuine JWKS verification without later dispatch", async () => {
		const abort = new AbortController();
		const cancellationConfig = {
			...config,
			issuer: "https://oidc.vercel.com/fake-owned-cancel-team",
		};
		let calls = 0;
		const closed = createGitlabSandboxProxy(cancellationConfig, async () => {
			calls++;
			return new Response("unexpected");
		});
		const started = new Promise<void>((resolve) => {
			keysRequested = resolve;
		});
		const input = new Request(
			request({ ...baseClaims(), iss: cancellationConfig.issuer }),
			{ signal: abort.signal },
		);
		const pending = closed(input);
		await started;
		abort.abort();
		const result = await Promise.race([
			pending,
			new Promise<Response>((resolve) =>
				setTimeout(
					() => resolve(new Response("timed out", { status: 504 })),
					50,
				),
			),
		]);
		unblockKeys?.();
		await pending;
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(result.status).toBe(403);
		expect(calls).toBe(0);
	});
	test("links the downstream request signal to the original input", async () => {
		const abort = new AbortController();
		let linked: AbortSignal | undefined;
		const closed = createGitlabSandboxProxy(config, async (req) => {
			linked = req.signal;
			return new Response("okay");
		});
		expect(
			(await closed(new Request(request(), { signal: abort.signal }))).status,
		).toBe(200);
		abort.abort();
		expect(linked?.aborted).toBe(true);
	});
	test("verifies actual RSA signatures and preserves raw metadata for later project authorization", async () => {
		const response = await proxy(request());
		expect(response.status).toBe(200);
		const output = await response.json();
		expect(output.identity).toEqual({
			teamId: config.teamId,
			projectId: config.projectId,
			sandboxId: "sbx_fake_owned",
			sandboxName: "superset-fake-owned",
		});
		expect(output.raw).toEqual({
			host: "gitlab.example.com",
			scheme: "https",
			port: "443",
			path: "/api/v4/projects/7?x=1",
		});
		expect(output.method).toBe("POST");
		expect(output.body).toBe("fake-body");
		expect(output.headers).not.toContain("vercel-sandbox-oidc-token");
		expect(keyRequests).toBeGreaterThan(0);
	});
	test("accepts a standard audience array containing the fixed broker audience", async () => {
		const response = await proxy(
			request({
				...baseClaims(),
				aud: ["https://another.example.com", config.forwardURL],
			}),
		);
		expect(response.status).toBe(200);
	});
	for (const [field, value] of [
		["iss", "https://oidc.vercel.com/foreign-team"],
		["aud", "https://other.example.com/gitlab"],
		["team_id", "team_foreign"],
		["project_id", "prj_foreign"],
		["sandbox_id", ""],
		["sandbox_name", ""],
		["sandbox_id", "fake,duplicate"],
		["exp", 1],
		["exp", undefined],
		["exp", "9999999999"],
		["iat", undefined],
		["iat", Math.floor(Date.now() / 1000) + 3600],
	])
		test(`rejects incorrect or missing signed ${field}: ${value}`, async () => {
			const claims = { ...baseClaims(), [field as string]: value };
			const response = await proxy(request(claims));
			expect(response.status).toBe(403);
			expect(await response.text()).toBe("Forbidden");
		});
	test("does not accept an altered RSA signature", async () => {
		const input = request();
		const valid = input.headers.get("vercel-sandbox-oidc-token") ?? "";
		const parts = valid.split(".");
		const signature = Buffer.from(parts[2] ?? "", "base64url");
		signature[0] = (signature[0] ?? 0) ^ 255;
		input.headers.set(
			"vercel-sandbox-oidc-token",
			`${parts[0]}.${parts[1]}.${signature.toString("base64url")}`,
		);
		expect((await proxy(input)).status).toBe(403);
	});
	for (const [header, value] of [
		["vercel-forwarded-host", "gitlab.example.com,evil.example.com"],
		["vercel-forwarded-host", "user:pass@gitlab.example.com"],
		["vercel-forwarded-scheme", "http"],
		["vercel-forwarded-port", "8443"],
		["vercel-forwarded-path", "/api/v4/projects/7/../8"],
		["vercel-forwarded-path", "/api/v4/projects/7/%2e%2e/8"],
		["vercel-forwarded-path", "//evil.example.com/path"],
		["vercel-forwarded-path", "/api/v4/projects/7#fragment"],
		["vercel-forwarded-path", "/api\\v4/projects/7"],
	])
		test(`rejects ambiguous raw ${header}: ${value}`, async () => {
			const response = await proxy(
				request(baseClaims(), { [header as string]: value as string }),
			);
			expect(response.status).toBe(403);
		});
	test("sanitizes downstream failure without leaking fake JWT or credentials", async () => {
		const fail = createGitlabSandboxProxy(config, async () => {
			throw new Error("fake-private-credential");
		});
		const response = await fail(request());
		expect(response.status).toBe(502);
		expect(await response.text()).toBe("GitLab request failed");
	});
});
