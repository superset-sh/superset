import { describe, expect, test } from "bun:test";
import { join } from "node:path";

for (const action of ["move", "create"] as const) {
	describe(`${action} collection rollback`, () => {
		test("a failed move preserves another project's concurrent move", () => {
			const result = Bun.spawnSync(
				[
					process.execPath,
					join(import.meta.dir, "fixtures/rollback.js"),
					action,
				],
				{ cwd: join(import.meta.dir, "../../../../../..") },
			);
			expect(result.exitCode, result.stderr.toString()).toBe(0);
		});
	});
}
