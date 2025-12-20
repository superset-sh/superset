import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import { getAppCommand, resolvePath } from "./helpers";

describe("getAppCommand", () => {
	test("returns null for finder (handled specially)", () => {
		expect(getAppCommand("finder", "/path/to/file")).toBeNull();
	});

	test("returns correct command for cursor", () => {
		const result = getAppCommand("cursor", "/path/to/file");
		expect(result).toEqual({
			command: "open",
			args: ["-a", "Cursor", "/path/to/file"],
		});
	});

	test("returns correct command for vscode", () => {
		const result = getAppCommand("vscode", "/path/to/file");
		expect(result).toEqual({
			command: "open",
			args: ["-a", "Visual Studio Code", "/path/to/file"],
		});
	});

	test("returns correct command for sublime", () => {
		const result = getAppCommand("sublime", "/path/to/file");
		expect(result).toEqual({
			command: "open",
			args: ["-a", "Sublime Text", "/path/to/file"],
		});
	});

	test("returns correct command for xcode", () => {
		const result = getAppCommand("xcode", "/path/to/file");
		expect(result).toEqual({
			command: "open",
			args: ["-a", "Xcode", "/path/to/file"],
		});
	});

	test("returns correct command for iterm", () => {
		const result = getAppCommand("iterm", "/path/to/file");
		expect(result).toEqual({
			command: "open",
			args: ["-a", "iTerm", "/path/to/file"],
		});
	});

	test("returns correct command for warp", () => {
		const result = getAppCommand("warp", "/path/to/file");
		expect(result).toEqual({
			command: "open",
			args: ["-a", "Warp", "/path/to/file"],
		});
	});

	test("returns correct command for terminal", () => {
		const result = getAppCommand("terminal", "/path/to/file");
		expect(result).toEqual({
			command: "open",
			args: ["-a", "Terminal", "/path/to/file"],
		});
	});

	describe("JetBrains IDEs", () => {
		test("returns correct command for intellij", () => {
			const result = getAppCommand("intellij", "/path/to/file");
			expect(result).toEqual({
				command: "open",
				args: ["-a", "IntelliJ IDEA", "/path/to/file"],
			});
		});

		test("returns correct command for webstorm", () => {
			const result = getAppCommand("webstorm", "/path/to/file");
			expect(result).toEqual({
				command: "open",
				args: ["-a", "WebStorm", "/path/to/file"],
			});
		});

		test("returns correct command for pycharm", () => {
			const result = getAppCommand("pycharm", "/path/to/file");
			expect(result).toEqual({
				command: "open",
				args: ["-a", "PyCharm", "/path/to/file"],
			});
		});

		test("returns correct command for goland", () => {
			const result = getAppCommand("goland", "/path/to/file");
			expect(result).toEqual({
				command: "open",
				args: ["-a", "GoLand", "/path/to/file"],
			});
		});

		test("returns correct command for rustrover", () => {
			const result = getAppCommand("rustrover", "/path/to/file");
			expect(result).toEqual({
				command: "open",
				args: ["-a", "RustRover", "/path/to/file"],
			});
		});
	});

	test("preserves paths with spaces", () => {
		const result = getAppCommand("cursor", "/path/with spaces/file.ts");
		expect(result).toEqual({
			command: "open",
			args: ["-a", "Cursor", "/path/with spaces/file.ts"],
		});
	});
});

describe("resolvePath", () => {
	const homedir = os.homedir();
	const originalHome = process.env.HOME;

	beforeEach(() => {
		process.env.HOME = homedir;
	});

	afterEach(() => {
		process.env.HOME = originalHome;
	});

	describe("home directory expansion", () => {
		test("expands ~ to home directory", () => {
			const result = resolvePath("~/Documents/file.ts");
			expect(result).toBe(path.join(homedir, "Documents/file.ts"));
		});

		test("expands ~ alone to home directory", () => {
			const result = resolvePath("~");
			expect(result).toBe(homedir);
		});

		test("does not expand ~ in middle of path", () => {
			const result = resolvePath("/path/~/file.ts");
			expect(result).toBe("/path/~/file.ts");
		});
	});

	describe("absolute paths", () => {
		test("returns absolute path unchanged", () => {
			const result = resolvePath("/absolute/path/file.ts");
			expect(result).toBe("/absolute/path/file.ts");
		});

		test("returns absolute path unchanged even with cwd", () => {
			const result = resolvePath("/absolute/path/file.ts", "/some/cwd");
			expect(result).toBe("/absolute/path/file.ts");
		});
	});

	describe("relative paths", () => {
		test("resolves relative path against cwd", () => {
			const result = resolvePath("src/file.ts", "/project");
			expect(result).toBe("/project/src/file.ts");
		});

		test("resolves ./prefixed path against cwd", () => {
			const result = resolvePath("./src/file.ts", "/project");
			expect(result).toBe("/project/src/file.ts");
		});

		test("resolves ../prefixed path against cwd", () => {
			const result = resolvePath("../sibling/file.ts", "/project/subdir");
			expect(result).toBe("/project/sibling/file.ts");
		});

		test("resolves relative path against process.cwd() when no cwd provided", () => {
			const result = resolvePath("file.ts");
			expect(result).toBe(path.resolve("file.ts"));
		});
	});

	describe("combined expansion", () => {
		test("expands ~ then resolves (already absolute after expansion)", () => {
			const result = resolvePath("~/file.ts", "/ignored/cwd");
			expect(result).toBe(path.join(homedir, "file.ts"));
		});
	});
});
