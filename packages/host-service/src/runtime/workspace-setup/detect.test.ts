import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectSetupCommand } from "./detect";

const roots: string[] = [];
function repo(manifest: unknown, files: string[] = []) {
	const root = mkdtempSync(join(tmpdir(), "setup-detect-"));
	roots.push(root);
	writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
	for (const file of files) writeFileSync(join(root, file), "");
	return root;
}
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});
test("packageManager wins over conflicting lockfiles", () => {
	expect(
		detectSetupCommand(
			repo({ packageManager: "pnpm@10.0.0" }, [
				"yarn.lock",
				"package-lock.json",
			]),
		),
	).toBe("pnpm install");
});
test("ambiguous lockfiles and unsupported explicit managers do not suggest commands", () => {
	expect(
		detectSetupCommand(repo({}, ["pnpm-lock.yaml", "yarn.lock"])),
	).toBeNull();
	expect(detectSetupCommand(repo({ packageManager: "other@1" }))).toBeNull();
});
test("recognizes lockfile families, including both bun formats", () => {
	expect(detectSetupCommand(repo({}, ["bun.lock", "bun.lockb"]))).toBe(
		"bun install",
	);
	expect(detectSetupCommand(repo({}, ["pnpm-lock.yaml"]))).toBe("pnpm install");
	expect(detectSetupCommand(repo({}))).toBe("npm install");
});
test("requires a valid manifest object", () => {
	expect(detectSetupCommand(repo([]))).toBeNull();
	expect(detectSetupCommand(repo(null))).toBeNull();
});
