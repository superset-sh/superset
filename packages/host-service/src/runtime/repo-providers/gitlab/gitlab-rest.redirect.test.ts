import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (process.env.SUPERSET_GITLAB_REDIRECT_FIXTURE !== "1") {
	test("native redirect characterization runs in an owned child", () => {
		const cwd = mkdtempSync(join(tmpdir(), "superset-owned-redirect-test-"));
		try {
			const child = spawnSync(
				process.execPath,
				["--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_GITLAB_REDIRECT_FIXTURE: "1",
					},
					stdio: "pipe",
					timeout: 25000,
				},
			);
			if (child.stdout) process.stdout.write(child.stdout);
			if (child.stderr) process.stderr.write(child.stderr);
			if (child.error) throw child.error;
			expect(child.status).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}, 30000);
} else {
	const { gitlabRest } = await import("./gitlab-rest");
	test("native fetch characterizes redirects; GitLab transport stops both same and cross origin redirects", async () => {
		const temp = mkdtempSync(join(tmpdir(), "superset-gitlab-redirect-"));
		const nativeFetch = globalThis.fetch;
		const generated = spawnSync(
			"openssl",
			[
				"req",
				"-x509",
				"-newkey",
				"rsa:2048",
				"-nodes",
				"-keyout",
				join(temp, "key.pem"),
				"-out",
				join(temp, "cert.pem"),
				"-days",
				"1",
				"-subj",
				"/CN=localhost",
			],
			{ stdio: "ignore" },
		);
		if (generated.status !== 0) {
			rmSync(temp, { recursive: true, force: true });
			throw new Error("Fixture certificate generation failed");
		}
		const tls = {
			key: readFileSync(join(temp, "key.pem")),
			cert: readFileSync(join(temp, "cert.pem")),
		};
		const secondTokens: Array<string | null> = [];
		const sameTokens: Array<string | null> = [];
		const second = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			tls,
			fetch(request): Response {
				secondTokens.push(request.headers.get("authorization"));
				return Response.json({ redirected: true });
			},
		});
		const first = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			tls,
			fetch(request): Response {
				const url = new URL(request.url);
				if (url.pathname === "/final") {
					sameTokens.push(request.headers.get("authorization"));
					return Response.json({ redirected: true });
				}
				return Response.redirect(
					url.pathname.endsWith("/cross")
						? `https://127.0.0.1:${second.port}/final`
						: `https://127.0.0.1:${first.port}/final`,
					302,
				);
			},
		});
		try {
			globalThis.fetch = ((input, init) => {
				const url = new URL(
					input instanceof Request ? input.url : String(input),
				);
				if (
					url.origin !== `https://127.0.0.1:${first.port}` &&
					url.origin !== `https://127.0.0.1:${second.port}`
				)
					throw new Error("Unexpected owned redirect fixture target");
				return nativeFetch(input, {
					...init,
					tls: { rejectUnauthorized: false },
				});
			}) as typeof fetch;
			const headers = { Authorization: "Bearer FIXTURE_ONLY_TOKEN" };
			await globalThis.fetch(`https://127.0.0.1:${first.port}/api/v4/same`, {
				headers,
			});
			await globalThis.fetch(`https://127.0.0.1:${first.port}/api/v4/cross`, {
				headers,
			});
			expect(sameTokens).toEqual(["Bearer FIXTURE_ONLY_TOKEN"]);
			expect(secondTokens).toEqual([null]);
			const deps = {
				host: `127.0.0.1:${first.port}`,
				token: async () => "FIXTURE_ONLY_TOKEN",
			};
			await expect(gitlabRest(deps, "/same")).rejects.toThrow();
			await expect(gitlabRest(deps, "/cross")).rejects.toThrow();
			expect(sameTokens).toHaveLength(1);
			expect(secondTokens).toHaveLength(1);
		} finally {
			globalThis.fetch = nativeFetch;
			first.stop(true);
			second.stop(true);
			rmSync(temp, { recursive: true, force: true });
		}
	});
}
