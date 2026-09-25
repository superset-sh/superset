import { describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { externalEntryPath, resolveEntryPath } from "./resolveEntryPath";

const workspacePath = "/Users/dev/ws";

describe("resolveEntryPath", () => {
	test("re-bases a path on the workspace root", () => {
		expect(
			resolveEntryPath({
				filePath: "./dist/index.html",
				workspacePath,
				cwd: "/Users/dev/ws/apps/marketing",
			}),
		).toBe("apps/marketing/dist/index.html");
	});

	test("resolves the same file to one key from two directories", () => {
		const fromRoot = resolveEntryPath({
			filePath: "./dist/index.html",
			workspacePath,
			cwd: workspacePath,
		});
		const fromInside = resolveEntryPath({
			filePath: "./index.html",
			workspacePath,
			cwd: "/Users/dev/ws/dist",
		});
		expect(fromRoot).toBe("dist/index.html");
		expect(fromInside).toBe(fromRoot);
	});

	test("accepts an absolute path inside the workspace", () => {
		expect(
			resolveEntryPath({
				filePath: "/Users/dev/ws/index.html",
				workspacePath,
				cwd: "/somewhere/else",
			}),
		).toBe("index.html");
	});

	test("returns null for a file outside the workspace", () => {
		expect(
			resolveEntryPath({
				filePath: "../other/index.html",
				workspacePath,
				cwd: workspacePath,
			}),
		).toBeNull();
	});

	test("returns null when there is no workspace", () => {
		expect(
			resolveEntryPath({
				filePath: "./index.html",
				workspacePath: undefined,
				cwd: "/tmp",
			}),
		).toBeNull();
	});

	test("returns null when the file is the workspace root itself", () => {
		expect(
			resolveEntryPath({ filePath: workspacePath, workspacePath, cwd: "/" }),
		).toBeNull();
	});

	test("keeps two case-variant workspaces apart on a case-sensitive volume", () => {
		const root = mkdtempSync(join(realpathSync(tmpdir()), "entry-path-case-"));
		const lower = join(root, "site");
		mkdirSync(lower);

		let caseSensitive = true;
		try {
			mkdirSync(join(root, "Site"));
		} catch {
			caseSensitive = false;
		}

		writeFileSync(join(root, "Site", "index.html"), "<!doctype html>");
		const resolved = resolveEntryPath({
			filePath: join(root, "Site", "index.html"),
			workspacePath: lower,
			cwd: root,
		});

		expect(resolved).toBe(caseSensitive ? null : "index.html");
	});

	test("re-bases a path that reaches the workspace through a symlink", () => {
		const root = mkdtempSync(join(realpathSync(tmpdir()), "entry-path-"));
		const real = join(root, "real");
		const link = join(root, "link");
		mkdirSync(join(real, "dist"), { recursive: true });
		writeFileSync(join(real, "dist", "index.html"), "<!doctype html>");
		symlinkSync(real, link, "dir");

		expect(
			resolveEntryPath({
				filePath: "./dist/index.html",
				workspacePath: real,
				cwd: link,
			}),
		).toBe("dist/index.html");
	});
});

describe("externalEntryPath", () => {
	test("keys an out-of-workspace file by its basename", () => {
		expect(externalEntryPath("/private/tmp/scratch/report.html")).toBe(
			"/external/report.html",
		);
	});

	test("gives one key to the same filename across agent sessions", () => {
		expect(externalEntryPath("/private/tmp/claude/aaaa-1111/report.html")).toBe(
			externalEntryPath("/private/tmp/claude/bbbb-2222/report.html"),
		);
	});

	test("cannot collide with a workspace-relative key", () => {
		expect(externalEntryPath("/tmp/index.html").startsWith("/")).toBe(true);
		expect(
			resolveEntryPath({
				filePath: "/Users/dev/ws/external/index.html",
				workspacePath,
				cwd: workspacePath,
			}),
		).toBe("external/index.html");
	});
});
