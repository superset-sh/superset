import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("a failed catalog cannot replace a newer locale and subsequent activation recovers", () => {
	const dir = mkdtempSync(join(tmpdir(), "lingui-failure-"));
	const result = join(dir, "result");
	try {
		execFileSync(process.execPath, [
			resolve(import.meta.dir, "fixtures/activation-failure.ts"),
			result,
		]);
		expect(readFileSync(result, "utf8")).toBe("passed");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
