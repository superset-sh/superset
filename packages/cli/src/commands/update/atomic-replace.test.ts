import { afterEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicReplace, backupRootFor } from "./atomic-replace";

const scratch: string[] = [];
function fixture() {
	const dir = mkdtempSync(join(tmpdir(), "atomic-replace-"));
	scratch.push(dir);
	const installRoot = join(dir, "superset");
	const newRoot = join(dir, "superset.update");
	mkdirSync(join(installRoot, "bin"), { recursive: true });
	mkdirSync(join(newRoot, "bin"), { recursive: true });
	writeFileSync(join(installRoot, "bin", "version"), "old");
	writeFileSync(join(newRoot, "bin", "version"), "new");
	return { installRoot, newRoot };
}
afterEach(() => {
	for (const dir of scratch.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

describe("atomicReplace", () => {
	test("swaps the new tree in and deletes the backup by default", () => {
		const { installRoot, newRoot } = fixture();
		atomicReplace(installRoot, newRoot);
		expect(readFileSync(join(installRoot, "bin", "version"), "utf8")).toBe(
			"new",
		);
		expect(existsSync(newRoot)).toBe(false);
		expect(existsSync(backupRootFor(installRoot))).toBe(false);
	});

	test("keepBackup leaves the previous install next to the new one", () => {
		const { installRoot, newRoot } = fixture();
		atomicReplace(installRoot, newRoot, { keepBackup: true });
		expect(readFileSync(join(installRoot, "bin", "version"), "utf8")).toBe(
			"new",
		);
		expect(
			readFileSync(join(backupRootFor(installRoot), "bin", "version"), "utf8"),
		).toBe("old");
	});

	test("a stale backup from an earlier run is replaced, not merged", () => {
		const { installRoot, newRoot } = fixture();
		mkdirSync(join(backupRootFor(installRoot), "bin"), { recursive: true });
		writeFileSync(join(backupRootFor(installRoot), "bin", "version"), "stale");
		atomicReplace(installRoot, newRoot, { keepBackup: true });
		expect(
			readFileSync(join(backupRootFor(installRoot), "bin", "version"), "utf8"),
		).toBe("old");
	});

	test("restores the old tree when the new one cannot be moved in", () => {
		const { installRoot } = fixture();
		expect(() =>
			atomicReplace(installRoot, join(installRoot, "..", "missing")),
		).toThrow();
		expect(readFileSync(join(installRoot, "bin", "version"), "utf8")).toBe(
			"old",
		);
		expect(existsSync(backupRootFor(installRoot))).toBe(false);
	});
});
