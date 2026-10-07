import { expect, mock, spyOn, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import type { NextConfig } from "next";

const cases = [
	{ name: "default form origin", apiUrl: undefined, allowed: "'self'" },
	{
		name: "separate HTTPS API with custom port",
		apiUrl: "https://api.example:8443/base",
		allowed: "'self' https://api.example:8443 https://gitlab.com",
	},
	{
		name: "local API origin",
		apiUrl: "http://localhost:3001",
		allowed: "'self' http://localhost:3001 https://gitlab.com",
	},
	{
		name: "trusted private OAuth issuer",
		apiUrl: "https://api.example",
		issuer: "https://git.example:8443/",
		allowed: "'self' https://api.example https://git.example:8443",
	},
	...[
		"https://user:password@git.example",
		"https://git.example/project",
		"https://git.example/?query=1",
		"https://127.0.0.1",
		"http://git.example",
	].map((issuer) => ({
		name: `invalid OAuth issuer ${issuer}`,
		apiUrl: "https://api.example",
		issuer,
		allowed: "'self' https://api.example",
	})),
];

if (!process.env.TEST_WEB_FORM_ORIGIN) {
	for (const item of cases) {
		test(item.name, () => {
			const cwd = mkdtempSync("/tmp/web-form-origin-");
			try {
				const child = spawnSync(
					process.execPath,
					["--no-env-file", "test", import.meta.path],
					{
						cwd,
						env: {
							PATH: "/usr/bin:/bin",
							TMPDIR: "/tmp",
							NODE_ENV: "production",
							TEST_WEB_FORM_ORIGIN: item.name,
							...(item.apiUrl ? { NEXT_PUBLIC_API_URL: item.apiUrl } : {}),
							...("issuer" in item ? { GITLAB_ISSUER: item.issuer } : {}),
						},
						timeout: 20_000,
						stdio: "pipe",
					},
				);
				process.stdout.write(child.stdout);
				process.stderr.write(child.stderr);
				if (child.error) throw child.error;
				expect(child.status).toBe(0);
			} finally {
				rmSync(cwd, { recursive: true, force: true });
			}
		}, 25_000);
	}
} else {
	const deny = () => {
		throw Error("Unexpected external operation");
	};
	globalThis.fetch = Object.assign(async () => deny(), { preconnect: deny });
	const net = await import("node:net");
	spyOn(net.Socket.prototype, "connect").mockImplementation(deny);
	const cp = await import("node:child_process");
	for (const key of [
		"spawn",
		"spawnSync",
		"exec",
		"execSync",
		"execFile",
		"execFileSync",
	] as const)
		spyOn(cp, key).mockImplementation(deny);
	spyOn(Bun, "spawn").mockImplementation(deny);
	spyOn(Bun, "spawnSync").mockImplementation(deny);
	mock.module("dotenv", () => ({ config: deny }));
	const withSentryConfig = (config: NextConfig) => config;
	mock.module("@sentry/nextjs", () => ({ withSentryConfig }));

	test("actual Next headers permit only the configured form origins", async () => {
		expect(
			Object.is(
				(await import("@sentry/nextjs")).withSentryConfig,
				withSentryConfig,
			),
		).toBe(true);
		const { default: config } = await import("./next.config");
		if (!config.headers) throw Error("Missing headers");
		const rules = await config.headers();
		expect(rules[0]?.source).toBe("/(.*)");
		const csp = rules[0]?.headers.find(
			(header) => header.key === "Content-Security-Policy",
		)?.value;
		if (!csp) throw Error("Missing CSP");
		const selected = cases.find(
			(item) => item.name === process.env.TEST_WEB_FORM_ORIGIN,
		);
		if (!selected) throw Error("Missing case");
		expect(
			csp.split("; ").find((part) => part.startsWith("form-action ")),
		).toBe(`form-action ${selected.allowed}`);
		expect(csp).toContain("frame-ancestors 'none'");
		expect(csp).toContain("object-src 'none'");
		expect(csp).not.toContain("form-action *");
		expect(csp).not.toContain("https://unconfigured.example");
		const headers = rules[0]?.headers;
		expect(
			headers?.find((header) => header.key === "X-Frame-Options")?.value,
		).toBe("DENY");
	});
}
