import { beforeEach, expect, mock, test } from "bun:test";
import { mkdirSync, readFileSync } from "node:fs";
import type { GitlabSandboxProxyConfig } from "@superset/trpc/lib/gitlab/sandbox-proxy";
import type { z } from "zod";

if (process.env.SUPERSET_GITLAB_PROXY_ROUTE_FIXTURE === "disabled") {
	globalThis.fetch = mock(async () => {
		throw new Error("Network forbidden in unconfigured route fixture");
	});
	mock.module("@superset/db/client", () => ({
		db: new Proxy(
			{},
			{
				get: () => {
					throw new Error("DB forbidden in unconfigured route fixture");
				},
			},
		),
	}));
	const route = await import("./route");
	test("unconfigured actual route imports and responds without broker or environment mocks", async () => {
		for (const method of ["GET", "HEAD", "POST", "PUT"] as const) {
			const response = await route[method](
				new Request("https://api.example.com/api/gitlab/proxy", { method }),
			);
			expect(response.status).toBe(503);
			expect(await response.text()).toBe("GitLab sandbox proxy unavailable");
		}
	});
} else if (process.env.SUPERSET_GITLAB_PROXY_ROUTE_FIXTURE === "1") {
	globalThis.fetch = mock(async () => {
		throw new Error("Network forbidden in owned route fixture");
	});
	let sequence = 0;
	let failFactory = false;
	let failHandler = false;
	const configs: GitlabSandboxProxyConfig[] = [];
	const requests: Request[] = [];
	const deadlines: number[] = [];
	const createGitlabSandboxBroker = mock(
		(
			config: GitlabSandboxProxyConfig,
			options: { binaryTimeoutMs: number },
		) => {
			deadlines.push(options.binaryTimeoutMs);
			configs.push(config);
			if (failFactory)
				throw new Error("OWNED_FAKE_SANDBOX_TOKEN private failure");
			return async (request: Request) => {
				requests.push(request);
				if (failHandler)
					throw new Error("OWNED_FAKE_SANDBOX_TOKEN private failure");
				return new Response(
					request.method === "HEAD" ? null : "owned broker reply",
					{ status: 202 },
				);
			};
		},
	);
	mock.module("@superset/trpc/lib/gitlab/sandbox-broker", () => ({
		createGitlabSandboxBroker,
	}));
	expect(
		(await import("@superset/trpc/lib/gitlab/sandbox-broker"))
			.createGitlabSandboxBroker,
	).toBe(createGitlabSandboxBroker);
	const route = await import("./route");
	beforeEach(() => {
		sequence++;
		Object.assign(process.env, {
			GITLAB_SANDBOX_OIDC_ISSUER: `https://oidc.vercel.com/owned-team-${sequence}`,
			VERCEL_SANDBOX_TOKEN: "OWNED_FAKE_SANDBOX_TOKEN",
			VERCEL_SANDBOX_TEAM_ID: "team_owned",
			VERCEL_SANDBOX_PROJECT_ID: "prj_owned",
			NEXT_PUBLIC_API_URL: "https://api.example.com",
		});
		delete process.env.GITLAB_SANDBOX_PROXY_URL;
		configs.length = 0;
		requests.length = 0;
		deadlines.length = 0;
		failFactory = false;
		failHandler = false;
	});
	const request = (
		method = "GET",
		url = "https://api.example.com/api/gitlab/proxy",
	) => new Request(url, { method });

	test("Node registry retains reviewed GET HEAD POST PUT only", () => {
		expect(route.runtime).toBe("nodejs");
		expect(route.maxDuration).toBe(800);
		expect(route.HEAD).toBe(route.GET);
		expect(route.POST).toBe(route.GET);
		expect(route.PUT).toBe(route.GET);
		expect(
			Object.keys(route)
				.filter((key) => /^[A-Z]+$/.test(key))
				.sort(),
		).toEqual(["GET", "HEAD", "POST", "PUT"]);
	});
	test("absent issuer fails closed before broker creation", async () => {
		delete process.env.GITLAB_SANDBOX_OIDC_ISSUER;
		const response = await route.GET(request());
		expect(response.status).toBe(503);
		expect(await response.text()).toBe("GitLab sandbox proxy unavailable");
		expect(configs).toHaveLength(0);
		expect(requests).toHaveLength(0);
	});
	test("all malformed or absent provider settings fail closed without acquiring credentials", async () => {
		for (const [key, value] of [
			["VERCEL_SANDBOX_TOKEN", ""],
			["VERCEL_SANDBOX_TEAM_ID", "foreign/team"],
			["VERCEL_SANDBOX_PROJECT_ID", ""],
			["GITLAB_SANDBOX_OIDC_ISSUER", "https://oidc.vercel.com"],
			[
				"GITLAB_SANDBOX_PROXY_URL",
				"https://broker.example.com/proxy?aud=foreign",
			],
		] as const) {
			const original = process.env[key];
			process.env[key] = value;
			const response = await route.POST(
				new Request(request().url, { method: "POST", body: "OWNED_BODY" }),
			);
			expect(response.status).toBe(503);
			expect(await response.text()).toBe("GitLab sandbox proxy unavailable");
			if (original === undefined) delete process.env[key];
			else process.env[key] = original;
		}
		expect(configs).toHaveLength(0);
		expect(requests).toHaveLength(0);
	});
	test("configured factory is lazy, reused concurrently, and receives fixed audience without token", async () => {
		expect(configs).toHaveLength(0);
		const responses = await Promise.all([
			route.GET(request()),
			route.HEAD(request("HEAD")),
			route.GET(request()),
		]);
		expect(responses.map((response) => response.status)).toEqual([
			202, 202, 202,
		]);
		expect(configs).toEqual([
			{
				issuer: process.env.GITLAB_SANDBOX_OIDC_ISSUER,
				teamId: "team_owned",
				projectId: "prj_owned",
				forwardURL: "https://api.example.com/api/gitlab/proxy",
			},
		]);
		expect(deadlines).toEqual([790_000]);
		expect(deadlines[0]).toBeLessThan(route.maxDuration * 1000);
		expect(JSON.stringify(configs)).not.toContain("OWNED_FAKE_SANDBOX_TOKEN");
	});
	test("SDK base and appended paths retain request body signal and original metadata unchanged", async () => {
		for (const method of ["POST", "PUT"] as const) {
			const control = new AbortController();
			const original = new Request(
				`https://api.example.com/api/gitlab/proxy${method === "PUT" ? "/group/repo.git/git-upload-pack" : ""}`,
				{
					method,
					body: "OWNED_BINARY_BODY",
					signal: control.signal,
					headers: {
						"vercel-forwarded-path": "/group/repo.git/git-upload-pack?x=1",
						"vercel-forwarded-host": "git.example.com",
						"content-type": "application/x-git-upload-pack-request",
					},
				},
			);
			expect((await route[method](original)).status).toBe(202);
			expect(requests.at(-1)).toBe(original);
			expect(await requests.at(-1)?.text()).toBe("OWNED_BINARY_BODY");
			expect(requests.at(-1)?.headers.get("vercel-forwarded-path")).toBe(
				"/group/repo.git/git-upload-pack?x=1",
			);
			control.abort();
			expect(requests.at(-1)?.signal.aborted).toBe(true);
		}
	});
	test("request Host URL and spoofed env headers cannot choose audience", async () => {
		process.env.GITLAB_SANDBOX_PROXY_URL =
			"https://standalone.example.com/owned/proxy";
		const original = new Request("https://foreign.example.com/path", {
			headers: {
				host: "attacker.example.com",
				GITLAB_SANDBOX_PROXY_URL: "https://attacker.example.com/proxy",
			},
		});
		expect((await route.GET(original)).status).toBe(202);
		expect(configs[0]?.forwardURL).toBe(
			"https://standalone.example.com/owned/proxy",
		);
		expect(requests[0]).toBe(original);
	});
	test("configuration changes replace cache and a later disabled setup cannot reuse it", async () => {
		expect((await route.GET(request())).status).toBe(202);
		process.env.GITLAB_SANDBOX_PROXY_URL =
			"https://standalone.example.com/owned/proxy";
		expect((await route.GET(request())).status).toBe(202);
		expect(configs).toHaveLength(2);
		delete process.env.GITLAB_SANDBOX_OIDC_ISSUER;
		expect((await route.GET(request())).status).toBe(503);
		expect(requests).toHaveLength(2);
	});
	test("factory failure is constant and a later request retries construction", async () => {
		failFactory = true;
		const failed = await route.GET(request());
		expect(failed.status).toBe(503);
		expect(await failed.text()).toBe("GitLab sandbox proxy unavailable");
		failFactory = false;
		expect((await route.GET(request())).status).toBe(202);
		expect(configs).toHaveLength(2);
	});
	test("unexpected handler error is sanitized", async () => {
		failHandler = true;
		const failed = await route.GET(request());
		expect(failed.status).toBe(503);
		expect(await failed.text()).toBe("GitLab sandbox proxy unavailable");
		expect(requests).toHaveLength(1);
	});
	test("actual API and tRPC schemas retain optional settings and five-place operator wiring", async () => {
		const schemas: Record<string, z.ZodType>[] = [];
		const createEnv = ({ server }: { server: Record<string, z.ZodType> }) => {
			schemas.push(server);
			return {};
		};
		mock.module("@t3-oss/env-nextjs", () => ({ createEnv }));
		mock.module("@t3-oss/env-core", () => ({ createEnv }));
		const root = new URL("../../../../../../../../", import.meta.url);
		await import(new URL("apps/api/src/env.ts", root).pathname);
		await import(new URL("packages/trpc/src/env.ts", root).pathname);
		expect(schemas).toHaveLength(2);
		const variables = [
			"GITLAB_SANDBOX_OIDC_ISSUER",
			"GITLAB_SANDBOX_PROXY_URL",
		];
		for (const schema of schemas)
			for (const variable of variables) {
				expect(schema[variable]?.safeParse(undefined).success).toBe(true);
				expect(schema[variable]?.safeParse(42).success).toBe(false);
				expect(
					schema[variable]?.safeParse("malformed-owned-setting").success,
				).toBe(true);
			}
		for (const variable of variables) {
			for (const template of [".env.example", ".env.local.example"])
				expect(
					readFileSync(new URL(template, root), "utf8")
						.split("\n")
						.filter((line) => line.startsWith(`${variable}=`)),
				).toEqual([`${variable}=`]);
			expect(readFileSync(new URL("turbo.jsonc", root), "utf8")).toContain(
				`"${variable}"`,
			);
			for (const workflow of ["deploy-production.yml", "deploy-preview.yml"]) {
				const source = readFileSync(
					new URL(`.github/workflows/${workflow}`, root),
					"utf8",
				);
				expect(source).toContain(`${variable}: \${{ secrets.${variable} }}`);
				expect(source).toContain(`--env ${variable}="$${variable}"`);
			}
			expect(
				readFileSync(new URL("docs/environment-variables.md", root), "utf8"),
			).toContain(`\`${variable}\``);
		}
		expect(configs).toHaveLength(0);
		expect(requests).toHaveLength(0);
	});
} else {
	for (const fixture of ["disabled", "1"])
		test(`isolated owned GitLab proxy route controls ${fixture}`, async () => {
			const cwd = "/tmp/superset-gitlab-proxy-route-test-20261004";
			mkdirSync(cwd, { recursive: true });
			const child = Bun.spawn(
				[process.execPath, "test", "--no-env-file", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH ?? "/usr/bin:/bin",
						TMPDIR: "/tmp",
						SUPERSET_GITLAB_PROXY_ROUTE_FIXTURE: fixture,
					},
					stdout: "pipe",
					stderr: "pipe",
				},
			);
			const [stdout, stderr, code] = await Promise.all([
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
				child.exited,
			]);
			process.stdout.write(stdout);
			process.stderr.write(stderr);
			expect(code).toBe(0);
		}, 20000);
}
