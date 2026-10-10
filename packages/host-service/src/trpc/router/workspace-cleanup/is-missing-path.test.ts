import { expect, test } from "bun:test";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isMissingPath } from "./is-missing-path";

test("missing paths exclude existing entries and dangling symlinks", async () => {
	const dir = await mkdtemp(join(tmpdir(), "missing-path-"));
	try {
		const absent = join(dir, "absent");
		const link = join(dir, "link");
		const file = join(dir, "file");
		await symlink(absent, link);
		await writeFile(file, "fixture");
		expect(await isMissingPath(absent)).toBe(true);
		expect(await isMissingPath(join(file, "child"))).toBe(true);
		expect(await isMissingPath(dir)).toBe(false);
		expect(await isMissingPath(file)).toBe(false);
		expect(await isMissingPath(link)).toBe(false);
	} finally {
		await rm(dir, { recursive: true });
	}
});
