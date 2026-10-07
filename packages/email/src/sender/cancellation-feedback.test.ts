import { expect, test } from "bun:test";

const root = new URL("../../../../", import.meta.url);

test("SMTP cancellation jobs validate requests then skip campaign lookup and provider traffic", async () => {
	const envPath = new URL("apps/api/src/env.ts", root).pathname;
	const verifyPath = new URL("apps/api/src/lib/verifyQstash.ts", root).pathname;
	const route = new URL(
		"apps/api/src/app/api/integrations/stripe/jobs/cancellation-feedback/route.ts",
		root,
	).pathname;
	const child = Bun.spawn(
		[
			process.execPath,
			"--no-env-file",
			"-e",
			`
		import { mock } from "bun:test";
		mock.module(${JSON.stringify(envPath)}, () => ({ env: {
			SMTP_URL: "smtp://127.0.0.1:1", STRIPE_SECRET_KEY: "sk_test_fixture",
			KV_REST_API_URL: "https://kv.example.test", KV_REST_API_TOKEN: "fixture"
		} }));
		mock.module(${JSON.stringify(verifyPath)}, () => ({ verifyQstashRequest: async (request) =>
			request.headers.get("x-fixture-reject") ? Response.json({ error: "fixture rejection" }, { status: 401 }) : null
		}));
		mock.module("@superset/db/client", () => ({ db: new Proxy({}, { get() { throw Error("Database must not be accessed in SMTP campaign mode"); } }) }));
		globalThis.fetch = async () => { throw Error("No external provider calls allowed"); };
		const { POST } = await import(${JSON.stringify(route)});
		const response = await POST(new Request("http://localhost/api/integrations/stripe/jobs/cancellation-feedback", { method: "POST", body: JSON.stringify({ stripeSubscriptionId: "sub_fixture", canceledAt: 100 }) }));
		if (response.status !== 200 || (await response.json()).skipped !== "SMTP lifecycle campaigns unavailable") throw Error("SMTP campaign was not skipped");
		const invalid = await POST(new Request("http://localhost/fixture", { method: "POST", body: "{}" }));
		if (invalid.status !== 400) throw Error("Request validation was skipped");
		const rejected = await POST(new Request("http://localhost/fixture", { method: "POST", headers: { "x-fixture-reject": "1" }, body: "{}" }));
		if (rejected.status !== 401) throw Error("Signature rejection was skipped");
	`,
		],
		{
			cwd: new URL("apps/api/", root).pathname,
			env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" },
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	expect({ stdout, stderr, exitCode }).toEqual({
		stdout: "",
		stderr: "",
		exitCode: 0,
	});
});

test("SMTP automation synchronization refuses provider traffic before reading templates", async () => {
	const script = new URL("packages/email/scripts/sync-automations.ts", root)
		.pathname;
	const child = Bun.spawn(
		[
			process.execPath,
			"--no-env-file",
			"-e",
			`
		globalThis.fetch = async () => { throw Error("Unexpected provider traffic"); };
		await import(${JSON.stringify(script)});
	`,
		],
		{
			cwd: new URL("packages/email/", root).pathname,
			env: {
				PATH: process.env.PATH ?? "",
				SMTP_URL: "smtp://127.0.0.1:1",
				RESEND_API_KEY: "re_owned_fixture",
			},
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const [stderr, exitCode] = await Promise.all([
		new Response(child.stderr).text(),
		child.exited,
	]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain(
		"Resend automation synchronization is unavailable when SMTP_URL is set",
	);
	expect(stderr).not.toContain("Unexpected provider traffic");
});
