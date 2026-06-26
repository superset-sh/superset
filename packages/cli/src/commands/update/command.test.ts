import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as realFs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Reproduction for #4630: `superset update` fails with
// `EXDEV: cross-device link not permitted` on Linux when /tmp and the install
// directory live on different filesystems. We can't mount two filesystems in a
// unit test, so we intercept `node:fs#renameSync` and treat any path under
// `simulatedTmpfsRoot` as a separate filesystem — `renameSync` then throws
// EXDEV for any cross-boundary move, mirroring the Amazon Linux behavior.

const realRenameSync = realFs.renameSync;
let simulatedTmpfsRoot: string | null = null;

function onTmpfs(path: string): boolean {
	return simulatedTmpfsRoot !== null && path.startsWith(simulatedTmpfsRoot);
}

mock.module("node:fs", () => ({
	...realFs,
	renameSync: (src: realFs.PathLike, dest: realFs.PathLike) => {
		const srcStr = String(src);
		const destStr = String(dest);
		if (simulatedTmpfsRoot !== null && onTmpfs(srcStr) !== onTmpfs(destStr)) {
			const err = new Error(
				`EXDEV: cross-device link not permitted, rename '${srcStr}' -> '${destStr}'`,
			) as NodeJS.ErrnoException;
			err.code = "EXDEV";
			throw err;
		}
		return realRenameSync(src, dest);
	},
}));

const { atomicReplace } = await import("./command");

describe("atomicReplace — cross-device install (#4630)", () => {
	let installSide: string;
	let tmpfsSide: string;
	let installRoot: string;
	let newRoot: string;

	beforeEach(() => {
		installSide = realFs.mkdtempSync(join(tmpdir(), "superset-install-"));
		tmpfsSide = realFs.mkdtempSync(join(tmpdir(), "superset-tmpfs-"));
		installRoot = join(installSide, "superset");
		newRoot = join(tmpfsSide, "superset");
	});

	afterEach(() => {
		simulatedTmpfsRoot = null;
		realFs.rmSync(installSide, { recursive: true, force: true });
		realFs.rmSync(tmpfsSide, { recursive: true, force: true });
	});

	test("replaces install root when src and dest share a filesystem", () => {
		realFs.mkdirSync(installRoot, { recursive: true });
		realFs.writeFileSync(join(installRoot, "old.txt"), "old");
		// newRoot stays on installSide so rename works.
		const sameFsNewRoot = join(installSide, "new");
		realFs.mkdirSync(join(sameFsNewRoot, "bin"), { recursive: true });
		realFs.writeFileSync(join(sameFsNewRoot, "bin", "superset"), "#!/bin/sh\n");

		atomicReplace(installRoot, sameFsNewRoot);

		expect(realFs.existsSync(join(installRoot, "bin", "superset"))).toBe(true);
		expect(realFs.existsSync(join(installRoot, "old.txt"))).toBe(false);
		expect(realFs.existsSync(`${installRoot}.bak`)).toBe(false);
		expect(realFs.existsSync(sameFsNewRoot)).toBe(false);
	});

	test("recovers when newRoot lives on a different filesystem (EXDEV)", () => {
		realFs.mkdirSync(installRoot, { recursive: true });
		realFs.writeFileSync(join(installRoot, "old.txt"), "old");
		realFs.mkdirSync(join(newRoot, "bin"), { recursive: true });
		realFs.writeFileSync(join(newRoot, "bin", "superset"), "#!/bin/sh\nnew\n");

		simulatedTmpfsRoot = tmpfsSide;

		atomicReplace(installRoot, newRoot);

		expect(realFs.existsSync(join(installRoot, "bin", "superset"))).toBe(true);
		expect(
			realFs.readFileSync(join(installRoot, "bin", "superset"), "utf8"),
		).toBe("#!/bin/sh\nnew\n");
		expect(realFs.existsSync(join(installRoot, "old.txt"))).toBe(false);
		expect(realFs.existsSync(`${installRoot}.bak`)).toBe(false);
		expect(realFs.existsSync(newRoot)).toBe(false);
	});
});
