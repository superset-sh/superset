import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("locale changes preserve state and focus while updating context formatters", () => {
	const temporary = mkdtempSync(join(tmpdir(), "lingui-provider-"));
	const result = join(temporary, "result.txt");
	try {
		execFileSync(
			process.execPath,
			[resolve(import.meta.dir, "fixtures/provider-state.tsx"), result],
			{ encoding: "utf8" },
		);
		expect(readFileSync(result, "utf8")).toBe("passed");
	} finally {
		rmSync(temporary, { recursive: true, force: true });
	}
});
