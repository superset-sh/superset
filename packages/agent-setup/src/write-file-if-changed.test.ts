import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeFileIfChanged } from "./write-file-if-changed";

const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "superset-wfic-"));

afterEach(() => {
	fs.rmSync(TEST_DIR, { recursive: true, force: true });
	fs.mkdirSync(TEST_DIR, { recursive: true });
});

describe("writeFileIfChanged", () => {
	it("writes new content with the requested mode and leaves no temp file", () => {
		const target = path.join(TEST_DIR, "notify.sh");

		expect(writeFileIfChanged(target, "#!/bin/bash\n", 0o755)).toBe(true);

		expect(fs.readFileSync(target, "utf-8")).toBe("#!/bin/bash\n");
		expect(fs.statSync(target).mode & 0o777).toBe(0o755);
		expect(fs.readdirSync(TEST_DIR)).toEqual(["notify.sh"]);
	});

	it("skips the write when content is unchanged", () => {
		const target = path.join(TEST_DIR, "settings.json");
		writeFileIfChanged(target, "{}", 0o644);
		const before = fs.statSync(target).mtimeMs;

		expect(writeFileIfChanged(target, "{}", 0o644)).toBe(false);

		expect(fs.statSync(target).mtimeMs).toBe(before);
	});

	it("replaces changed content atomically via rename", () => {
		const target = path.join(TEST_DIR, "rcfile");
		writeFileIfChanged(target, "old", 0o644);

		expect(writeFileIfChanged(target, "new", 0o644)).toBe(true);

		expect(fs.readFileSync(target, "utf-8")).toBe("new");
		expect(fs.readdirSync(TEST_DIR)).toEqual(["rcfile"]);
	});

	it("writes through a symlinked target instead of replacing the link", () => {
		const realDir = path.join(TEST_DIR, "dotfiles");
		fs.mkdirSync(realDir);
		const real = path.join(realDir, "settings.json");
		fs.writeFileSync(real, "{}");
		const linkDir = path.join(TEST_DIR, "home");
		fs.mkdirSync(linkDir);
		const target = path.join(linkDir, "settings.json");
		fs.symlinkSync(real, target);

		expect(writeFileIfChanged(target, '{"hooks":{}}', 0o644)).toBe(true);

		expect(fs.lstatSync(target).isSymbolicLink()).toBe(true);
		expect(fs.readFileSync(real, "utf-8")).toBe('{"hooks":{}}');
		expect(fs.readdirSync(linkDir)).toEqual(["settings.json"]);
		expect(fs.readdirSync(realDir)).toEqual(["settings.json"]);
	});

	it("skips the write when a symlinked target already has the content", () => {
		const real = path.join(TEST_DIR, "real.json");
		fs.writeFileSync(real, "{}");
		const target = path.join(TEST_DIR, "link.json");
		fs.symlinkSync(real, target);

		expect(writeFileIfChanged(target, "{}", 0o644)).toBe(false);

		expect(fs.lstatSync(target).isSymbolicLink()).toBe(true);
	});

	it("claims the path when the symlink dangles", () => {
		const target = path.join(TEST_DIR, "dangling.json");
		fs.symlinkSync(path.join(TEST_DIR, "gone.json"), target);

		expect(writeFileIfChanged(target, "{}", 0o644)).toBe(true);

		expect(fs.readFileSync(target, "utf-8")).toBe("{}");
		expect(fs.readdirSync(TEST_DIR)).toEqual(["dangling.json"]);
	});

	it("claims the path when the symlink is cyclic", () => {
		const target = path.join(TEST_DIR, "loop.json");
		const other = path.join(TEST_DIR, "loop-other.json");
		fs.symlinkSync(other, target);
		fs.symlinkSync(target, other);

		expect(writeFileIfChanged(target, "{}", 0o644)).toBe(true);

		expect(fs.readFileSync(target, "utf-8")).toBe("{}");
		expect(fs.lstatSync(target).isSymbolicLink()).toBe(false);
	});

	it("surfaces a resolution failure that is not a broken link", () => {
		const blocker = path.join(TEST_DIR, "not-a-dir");
		fs.writeFileSync(blocker, "");
		const target = path.join(blocker, "settings.json");

		expect(() => writeFileIfChanged(target, "{}", 0o644)).toThrow(/ENOTDIR/);

		expect(fs.readdirSync(TEST_DIR)).toEqual(["not-a-dir"]);
	});

	it.skipIf(process.getuid?.() === 0)(
		"names both paths when the link points into a read-only store",
		() => {
			const storeDir = path.join(TEST_DIR, "store");
			fs.mkdirSync(storeDir);
			const real = path.join(storeDir, "settings.json");
			fs.writeFileSync(real, "{}", { mode: 0o444 });
			fs.chmodSync(storeDir, 0o555);
			const target = path.join(TEST_DIR, "settings.json");
			fs.symlinkSync(real, target);

			try {
				let message = "";
				try {
					writeFileIfChanged(target, '{"hooks":{}}', 0o644);
				} catch (error) {
					message = (error as Error).message;
				}

				expect(message).toContain(target);
				expect(message).toContain(fs.realpathSync(real));
				expect(message).toContain("is not writable (EACCES)");
				expect(fs.lstatSync(target).isSymbolicLink()).toBe(true);
				expect(fs.readFileSync(real, "utf-8")).toBe("{}");
			} finally {
				fs.chmodSync(storeDir, 0o755);
			}
		},
	);

	it("cleans up the temp file when the write fails", () => {
		const target = path.join(TEST_DIR, "missing-dir", "file");

		expect(() => writeFileIfChanged(target, "x", 0o644)).toThrow();

		expect(fs.readdirSync(TEST_DIR)).toEqual([]);
	});
});
