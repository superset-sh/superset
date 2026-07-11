import { describe, expect, it } from "bun:test";
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
import { atomicReplace } from "./command";

function withInstallRoots(
	run: (paths: { installRoot: string; newRoot: string }) => void,
): void {
	const directory = mkdtempSync(join(tmpdir(), "superset-update-replace-"));
	const installRoot = join(directory, "install");
	const newRoot = join(directory, "new");
	mkdirSync(installRoot);
	mkdirSync(newRoot);
	writeFileSync(join(installRoot, "version"), "old");
	writeFileSync(join(newRoot, "version"), "new");
	try {
		run({ installRoot, newRoot });
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

describe("atomicReplace", () => {
	it("removes the backup during a normal update", () => {
		withInstallRoots(({ installRoot, newRoot }) => {
			atomicReplace(installRoot, newRoot);
			expect(readFileSync(join(installRoot, "version"), "utf8")).toBe("new");
			expect(existsSync(`${installRoot}.bak`)).toBe(false);
		});
	});

	it("retains the old install for supervised verification", () => {
		withInstallRoots(({ installRoot, newRoot }) => {
			atomicReplace(installRoot, newRoot, { keepBackup: true });
			expect(readFileSync(join(installRoot, "version"), "utf8")).toBe("new");
			expect(readFileSync(join(`${installRoot}.bak`, "version"), "utf8")).toBe(
				"old",
			);
		});
	});
});
