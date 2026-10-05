import { expect, test } from "bun:test";
import { join } from "node:path";

test("the collapsed count and accessibility label include projects without workspaces", () => {
	const result = Bun.spawnSync(
		[process.execPath, join(import.meta.dir, "fixtures/count.js")],
		{ cwd: join(import.meta.dir, "../../../../../..") },
	);
	expect(result.exitCode, result.stderr.toString()).toBe(0);
});
