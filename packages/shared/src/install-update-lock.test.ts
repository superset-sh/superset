import { afterEach, expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireInstallUpdateLock } from "./install-update-lock";

const dirs: string[] = [];
function root() {
	const dir = mkdtempSync(join(tmpdir(), "install-lock-"));
	dirs.push(dir);
	return join(dir, "superset");
}
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});
test("serializes updates across all hosts sharing one install", () => {
	const path = root();
	const release = acquireInstallUpdateLock(path);
	expect(() => acquireInstallUpdateLock(path)).toThrow("Install update locked");
	release();
	const next = acquireInstallUpdateLock(path);
	next();
	expect(existsSync(`${path}.update-lock`)).toBe(false);
});
test("the CLI may borrow its parent host's lock without releasing it", () => {
	const path = root();
	writeFileSync(`${path}.update-lock`, String(process.ppid));
	const release = acquireInstallUpdateLock(path, { allowParent: true });
	release();
	expect(readFileSync(`${path}.update-lock`, "utf8")).toBe(
		String(process.ppid),
	);
	expect(() => acquireInstallUpdateLock(path)).toThrow("Install update locked");
});
test("an incomplete lock is never silently removed", () => {
	const path = root();
	writeFileSync(`${path}.update-lock`, "");
	expect(() => acquireInstallUpdateLock(path, { allowParent: true })).toThrow(
		"Install update locked",
	);
	expect(existsSync(`${path}.update-lock`)).toBe(true);
});
