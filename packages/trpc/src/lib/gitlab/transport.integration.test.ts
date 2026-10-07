import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitlabApiFetch } from "./api";
import { type GitLabTransportOptions, safeGitLabFetch } from "./transport";

const cleanups: Array<() => void> = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "superset-gitlab-api-tls-"));
	cleanups.push(() => rmSync(root, { recursive: true, force: true }));
	const generated = spawnSync(
		"openssl",
		[
			"req",
			"-x509",
			"-newkey",
			"rsa:2048",
			"-nodes",
			"-keyout",
			join(root, "key.pem"),
			"-out",
			join(root, "cert.pem"),
			"-days",
			"1",
			"-subj",
			"/CN=gitlab.fixture.test",
			"-addext",
			"subjectAltName=DNS:gitlab.fixture.test",
		],
		{ stdio: "ignore" },
	);
	if (generated.status !== 0)
		throw new Error("Fixture certificate generation failed");
	const cert = readFileSync(join(root, "cert.pem"));
	const key = readFileSync(join(root, "key.pem"));
	const visits: string[] = [];
	const target = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		tls: { cert, key },
		fetch(): Response {
			visits.push("redirect destination");
			return Response.json({ redirected: true });
		},
	});
	cleanups.push(() => target.stop(true));
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		tls: { cert, key },
		async fetch(request): Promise<Response> {
			const path = new URL(request.url).pathname;
			visits.push(path);
			if (path === "/redirect")
				return Response.redirect(
					`https://gitlab.fixture.test:${target.port}/internal`,
					302,
				);
			if (path === "/large") return new Response("x".repeat(1024));
			if (path === "/slow")
				await new Promise((resolve) => setTimeout(resolve, 500));
			if (path === "/empty") return new Response(null, { status: 204 });
			return Response.json({
				path,
				method: request.method,
				body: await request.text(),
				host: request.headers.get("Host"),
				authorization: request.headers.get("Authorization"),
				privateToken: request.headers.get("Private-Token"),
				jobToken: request.headers.get("Job-Token"),
				cookie: request.headers.get("Cookie"),
			});
		},
	});
	cleanups.push(() => server.stop(true));
	const origin = `https://gitlab.fixture.test:${server.port}`;
	let resolutions = 0;
	const options: GitLabTransportOptions = {
		issuer: origin,
		timeoutMs: 2000,
		resolve: async () => {
			resolutions++;
			return [
				{ address: resolutions === 1 ? "127.0.0.1" : "127.0.0.2", family: 4 },
			];
		},
		request: (url, init, callback) =>
			httpsRequest(url, { ...init, ca: cert }, callback),
	};
	return { origin, visits, options, resolutions: () => resolutions };
}
test("native HTTPS request uses the pinned DNS answer with verified TLS and original authority", async () => {
	const { origin, options, resolutions } = fixture();
	const response = await safeGitLabFetch(
		`${origin}/api/v4/user`,
		{ headers: { Authorization: "Bearer FIXTURE_ONLY_TOKEN" } },
		options,
	);
	expect(await response.json()).toMatchObject({
		path: "/api/v4/user",
		authorization: "Bearer FIXTURE_ONLY_TOKEN",
		host: new URL(origin).host,
	});
	expect(resolutions()).toBe(1);
});
test("native HTTPS redirect rejects before contacting its destination", async () => {
	const { origin, options, visits } = fixture();
	await expect(
		safeGitLabFetch(
			`${origin}/redirect`,
			{ headers: { Authorization: "Bearer FIXTURE_ONLY_TOKEN" } },
			options,
		),
	).rejects.toThrow("redirects");
	expect(visits).toEqual(["/redirect"]);
});
test("native HTTPS preserves supported bodies and no-content responses", async () => {
	const { origin, options } = fixture();
	const response = await safeGitLabFetch(
		`${origin}/echo`,
		{
			method: "POST",
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code: "FIXTURE_AUTH_CODE",
				client_secret: "FIXTURE_CLIENT_SECRET",
			}),
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
		},
		options,
	);
	expect(await response.json()).toMatchObject({
		method: "POST",
		body: "grant_type=authorization_code&code=FIXTURE_AUTH_CODE&client_secret=FIXTURE_CLIENT_SECRET",
	});
	const empty = await safeGitLabFetch(
		`${origin}/empty`,
		{},
		{ ...options, resolve: async () => [{ address: "127.0.0.1", family: 4 }] },
	);
	expect(empty.status).toBe(204);
	expect(await empty.text()).toBe("");
});
test("response byte limit and full request deadline bound real HTTPS", async () => {
	const { origin, options } = fixture();
	await expect(
		safeGitLabFetch(
			`${origin}/large`,
			{},
			{ ...options, maxResponseBytes: 64 },
		),
	).rejects.toThrow("size limit");
	await expect(
		safeGitLabFetch(
			`${origin}/slow`,
			{},
			{
				...options,
				resolve: async () => [{ address: "127.0.0.1", family: 4 }],
				timeoutMs: 50,
			},
		),
	).rejects.toThrow();
});
test("deadline also bounds unresolved DNS and caller cancellation before opening a socket", async () => {
	const { origin, options, visits } = fixture();
	await expect(
		safeGitLabFetch(
			`${origin}/api/v4/user`,
			{},
			{ ...options, timeoutMs: 25, resolve: () => new Promise(() => {}) },
		),
	).rejects.toThrow();
	const controller = new AbortController();
	controller.abort(new Error("Caller cancelled"));
	await expect(
		safeGitLabFetch(
			`${origin}/api/v4/user`,
			{ signal: controller.signal },
			options,
		),
	).rejects.toThrow("Caller cancelled");
	expect(visits).toEqual([]);
});
test("API attaches only selected credential, keeps custom port, and copies caller headers", async () => {
	const { origin, options } = fixture();
	const headers = new Headers({
		Authorization: "Bearer OLD_FIXTURE_TOKEN",
		"Private-Token": "SECOND_FIXTURE_TOKEN",
		"Job-Token": "JOB_FIXTURE_TOKEN",
		Cookie: "fixture=session",
		"Content-Type": "application/json",
	});
	const response = await gitlabApiFetch(
		origin,
		"SELECTED_FIXTURE_TOKEN",
		"/projects/Acme%2Fwidget",
		{ headers },
		(url, init) => safeGitLabFetch(url, init, options),
	);
	expect(await response.json()).toMatchObject({
		path: "/api/v4/projects/Acme%2Fwidget",
		authorization: "Bearer SELECTED_FIXTURE_TOKEN",
		privateToken: null,
		jobToken: null,
		cookie: null,
	});
	expect(headers.get("Authorization")).toBe("Bearer OLD_FIXTURE_TOKEN");
	expect(headers.get("Private-Token")).toBe("SECOND_FIXTURE_TOKEN");
});
