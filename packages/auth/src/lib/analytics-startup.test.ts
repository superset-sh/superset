import { expect, test } from "bun:test";
import path from "node:path";

const root = path.resolve(import.meta.dir, "../../../..");
const surfaces = [
	["packages/auth", "src/lib/analytics.ts", "posthog"],
	["packages/trpc", "src/lib/analytics.ts", "posthog"],
	["apps/api", "src/lib/analytics.ts", "posthog"],
	["apps/web", "src/lib/posthog-server.ts", "posthogServer"],
] as const;
for (const [surface, file, exportName] of surfaces) {
	for (const key of [
		undefined,
		"",
		"build",
		"unused",
		"phc_local_dev_disabled",
		"phc_test_configured",
	]) {
		test(`${surface} starts with ${String(key)} using the real server SDK`, () => {
			const cwd = path.join(root, surface);
			const script = `import { mock } from "bun:test";
    import assert from "node:assert/strict";
    mock.module(${JSON.stringify(path.join(cwd, "src/env.ts"))}, () => ({ env: { NEXT_PUBLIC_POSTHOG_KEY: ${JSON.stringify(key)}, NEXT_PUBLIC_POSTHOG_HOST: "https://analytics.example.invalid" } }));
    const { ${exportName}: client } = await import(${JSON.stringify(path.join(cwd, file))});
    if (${JSON.stringify(key)} === "phc_test_configured") {
     assert.equal(client.constructor.name, "PostHog");
     assert.equal(client.options.host, "https://analytics.example.invalid");
     assert.equal(client.options.flushAt, 1);
     assert.equal(client.options.flushInterval, 0);
     assert.notEqual(client.options.disabled, true);
     ${surface === "packages/auth" ? "assert.equal(client.options.requestTimeout, 3000);" : ""}
    } else {
     assert.equal(client.constructor.name, "Object");
     assert.equal(client.capture("event"), undefined);
     assert.equal(await client.isFeatureEnabled("cloud", "user"), undefined);
     assert.equal(await client.getFeatureFlagPayload("menu", "user"), undefined);
    }
    await client.shutdown();`;
			const result = Bun.spawnSync([process.execPath, "-e", script], {
				cwd,
				env: { PATH: process.env.PATH, NODE_ENV: "test" },
				stdout: "pipe",
				stderr: "pipe",
				timeout: 5000,
			});
			expect(result.stderr.toString()).toBe("");
			expect(result.exitCode).toBe(0);
		});
	}
}
