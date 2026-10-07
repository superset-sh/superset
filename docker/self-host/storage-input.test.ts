import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

for (const secret of [undefined, "x".repeat(31)]) {
	test(`disposable Worker proof refuses ${secret ? "short" : "missing"} ticket input before storage I/O`, () => {
		const root = mkdtempSync(join(tmpdir(), "superset-storage-input-"));
		try {
			const file = join(root, "fixture.env");
			writeFileSync(
				file,
				secret
					? `USERCONTENT_TOKEN_SECRET=${secret}\n`
					: "# owned missing input\n",
				{ mode: 0o600 },
			);
			const script = `import assert from "node:assert/strict";let calls=0;global.fetch=()=>{calls++;throw Error("Unexpected storage request")};try{await import(${JSON.stringify(join(import.meta.dir, "storage.integration.ts"))});throw Error("Missing refusal")}catch(error){assert.match(error.message,/matching USERCONTENT_TOKEN_SECRET of at least 32 characters/);assert.equal(calls,0)}`;
			const result = Bun.spawnSync(
				[process.execPath, "--no-env-file", "-e", script],
				{
					env: {
						PATH: process.env.PATH,
						STORAGE_TEST_ENV_FILE: file,
						STORAGE_WORKER_PROOF: "1",
					},
					stdout: "pipe",
					stderr: "pipe",
					timeout: 5000,
				},
			);
			expect(result.stderr.toString()).toBe("");
			expect(result.exitCode).toBe(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
}
