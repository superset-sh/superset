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

	it("cleans up the temp file when the write fails", () => {
		const target = path.join(TEST_DIR, "missing-dir", "file");

		expect(() => writeFileIfChanged(target, "x", 0o644)).toThrow();

		expect(fs.readdirSync(TEST_DIR)).toEqual([]);
	});
});
