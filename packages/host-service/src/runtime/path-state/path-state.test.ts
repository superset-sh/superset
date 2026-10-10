import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	getPathState,
	isMissingPath,
	isPermissionDenied,
	permissionDeniedPath,
} from "./path-state";

let root: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "superset-path-state-"));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("getPathState", () => {
	test("tells directories, files, and missing paths apart", () => {
		const file = join(root, "file.txt");
		writeFileSync(file, "x");

		expect(getPathState(root)).toBe("directory");
		expect(getPathState(file)).toBe("file");
		expect(getPathState(join(root, "absent"))).toBe("missing");
		expect(getPathState(join(file, "child"))).toBe("missing");
	});

	test("sees a dangling symlink only when not following it", () => {
		const link = join(root, "link");
		symlinkSync(join(root, "absent"), link);

		expect(getPathState(link)).toBe("missing");
		expect(getPathState(link, { followSymlinks: false })).toBe("file");
	});

	test.skipIf(process.getuid?.() === 0)(
		"reports a path behind a locked directory as inaccessible, not missing",
		() => {
			const locked = join(root, "locked");
			mkdirSync(join(locked, "inner"), { recursive: true });
			chmodSync(locked, 0o000);
			try {
				expect(getPathState(join(locked, "inner"))).toBe("inaccessible");
			} finally {
				chmodSync(locked, 0o755);
			}
		},
	);

	test.skipIf(process.getuid?.() === 0)(
		"reports a directory it can stat but not read as inaccessible",
		() => {
			const locked = join(root, "locked");
			mkdirSync(locked);
			chmodSync(locked, 0o000);
			try {
				expect(getPathState(locked)).toBe("inaccessible");
				expect(isMissingPath(locked)).toBe(false);
			} finally {
				chmodSync(locked, 0o755);
			}
		},
	);

	test("treats a symlink loop as missing, not as a permission problem", () => {
		const loop = join(root, "loop");
		symlinkSync(loop, loop);

		expect(getPathState(loop)).toBe("missing");
	});
});

describe("isPermissionDenied", () => {
	const fsError = (code: string, syscall: string, path: string) =>
		Object.assign(new Error(`${code}: ${syscall} '${path}'`), {
			code,
			syscall,
			path,
		});

	test("matches fs permission errors and names their path", () => {
		const err = fsError("EPERM", "scandir", "/drive/repo");

		expect(isPermissionDenied(err)).toBe(true);
		expect(permissionDeniedPath(new Error("wrap", { cause: err }))).toBe(
			"/drive/repo",
		);
	});

	test("matches git failing to read its working directory", () => {
		expect(
			isPermissionDenied(
				new Error(
					"fatal: Unable to read current working directory: Operation not permitted",
				),
			),
		).toBe(true);
		expect(
			isPermissionDenied(
				new Error("fatal: cannot change to '/drive/repo': Permission denied"),
			),
		).toBe(true);
	});

	test("does not name the command of a spawn error as the path", () => {
		const err = fsError("EACCES", "spawn git", "git");

		expect(permissionDeniedPath(err)).toBeUndefined();
	});

	test("ignores SSH auth failures and errors without a path", () => {
		expect(
			isPermissionDenied(
				new Error("git@github.com: Permission denied (publickey)."),
			),
		).toBe(false);
		expect(
			isPermissionDenied(
				Object.assign(new Error("kill EPERM"), { code: "EPERM" }),
			),
		).toBe(false);
	});
});
