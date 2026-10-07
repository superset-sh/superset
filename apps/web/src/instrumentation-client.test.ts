import { expect, test } from "bun:test";
import path from "node:path";

const cwd = path.resolve(import.meta.dir, "..");
for (const key of [
	undefined,
	"",
	"build",
	"unused",
	"phc_local_dev_disabled",
	"phc_test_configured",
]) {
	test(`web browser analytics starts with ${String(key)} using the real JS SDK`, () => {
		const script = `import { mock } from "bun:test";
   import assert from "node:assert/strict";
   import path from "node:path";
   mock.module("@sentry/nextjs", () => ({ init() {}, thirdPartyErrorFilterIntegration() { return {}; }, captureRouterTransitionStart() {} }));
   mock.module(path.resolve("src/env.ts"), () => ({ env: { NEXT_PUBLIC_POSTHOG_KEY: ${JSON.stringify(key)} } }));
   let registered = false;
   mock.module(path.resolve("src/lib/posthog-client.ts"), () => ({ registerBaseProperties() { registered = true; } }));
   global.fetch = async () => Response.json({});
   const { default: posthog } = await import("posthog-js");
   await import(path.resolve("src/instrumentation-client.ts"));
   if (${JSON.stringify(key)} === "phc_test_configured") {
    assert.equal(posthog.config.token, "phc_test_configured");
    assert.equal(posthog.config.api_host, "/ingest");
    assert.equal(posthog.config.capture_pageview, "history_change");
    assert.equal(posthog.config.person_profiles, "always");
    assert.equal(posthog.config.persistence, "cookie");
    assert.equal(registered, true);
   } else {
    assert.equal(posthog.config.token, "");
    assert.equal(registered, false);
   }
   process.exit(0);`;
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
