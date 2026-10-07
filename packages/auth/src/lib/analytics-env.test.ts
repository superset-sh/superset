import { expect, test } from "bun:test";
import path from "node:path";

const root = path.resolve(import.meta.dir, "../../../..");
for (const surface of ["apps/api", "apps/web"]) {
	test(`${surface} validates its environment without analytics settings`, () => {
		const script = `import { readFileSync } from "node:fs";
   import assert from "node:assert/strict";
   const { parse } = await import(${JSON.stringify(Bun.resolveSync("dotenv", path.join(root, "packages/auth")))});
   Object.assign(process.env, parse(readFileSync(${JSON.stringify(path.join(root, ".env.local.example"))})));
   process.env.NODE_ENV = "test";
   delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
   delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
   const { env } = await import(${JSON.stringify(path.join(root, surface, "src/env.ts"))});
   assert.equal(env.NEXT_PUBLIC_POSTHOG_KEY, undefined);
   assert.equal(env.NEXT_PUBLIC_POSTHOG_HOST, "https://us.i.posthog.com");`;
		const result = Bun.spawnSync([process.execPath, "-e", script], {
			cwd: path.join(root, surface),
			env: { PATH: process.env.PATH, NODE_ENV: "test" },
			stdout: "pipe",
			stderr: "pipe",
			timeout: 5000,
		});
		expect(result.stderr.toString()).toBe("");
		expect(result.exitCode).toBe(0);
	});
}
