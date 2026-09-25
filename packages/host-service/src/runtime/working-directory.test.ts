import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detachFromLaunchDirectory } from "./working-directory";

describe("detachFromLaunchDirectory", () => {
	test("leaves a launch directory that has been deleted", () => {
		const launchDir = mkdtempSync(join(tmpdir(), "superset-launch-dir-"));
		const original = process.cwd();
		try {
			process.chdir(launchDir);
			rmSync(launchDir, { recursive: true, force: true });

			detachFromLaunchDirectory();

			// The invariant the worker bootstrap needs: the process sits in a
			// directory that still exists. (macOS keeps reporting the deleted
			// path from process.cwd() until something moves off it.)
			expect(process.cwd()).not.toBe(launchDir);
			expect(existsSync(process.cwd())).toBe(true);
		} finally {
			process.chdir(original);
		}
	});
});
