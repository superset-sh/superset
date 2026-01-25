import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import { getAppCommand, resolvePath, stripPathWrappers } from "./helpers";

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

	describe("file:// URL handling", () => {
		test("converts file:// URL to regular path", () => {
			const result = resolvePath("file:///Users/test/Documents/file.ts");
			expect(result).toBe("/Users/test/Documents/file.ts");
		});

		test("decodes URL-encoded characters in file:// URL", () => {
			const result = resolvePath("file:///Users/test/My%20Documents/file.ts");
			expect(result).toBe("/Users/test/My Documents/file.ts");
		});

		test("handles file:// URL with special characters", () => {
			const result = resolvePath(
				"file:///Users/test/path%20with%20spaces/file%2B1.ts",
			);
			expect(result).toBe("/Users/test/path with spaces/file+1.ts");
		});

		test("handles file:// URL unchanged when already absolute", () => {
			const result = resolvePath(
				"file:///absolute/path/file.ts",
				"/ignored/cwd",
			);
			expect(result).toBe("/absolute/path/file.ts");
		});
	});

	describe("wrapper character stripping", () => {
		test("strips double quotes from path", () => {
			const result = resolvePath('"/absolute/path/file.ts"');
			expect(result).toBe("/absolute/path/file.ts");
		});

		test("strips single quotes from path", () => {
			const result = resolvePath("'/absolute/path/file.ts'");
			expect(result).toBe("/absolute/path/file.ts");
		});

		test("strips backticks from path", () => {
			const result = resolvePath("`/absolute/path/file.ts`");
			expect(result).toBe("/absolute/path/file.ts");
		});

		test("strips parentheses from path", () => {
			const result = resolvePath("(/absolute/path/file.ts)");
			expect(result).toBe("/absolute/path/file.ts");
		});

		test("strips square brackets from path", () => {
			const result = resolvePath("[/absolute/path/file.ts]");
			expect(result).toBe("/absolute/path/file.ts");
		});

		test("strips angle brackets from path", () => {
			const result = resolvePath("</absolute/path/file.ts>");
			expect(result).toBe("/absolute/path/file.ts");
		});

		test("strips nested wrappers", () => {
			const result = resolvePath("\"'/absolute/path/file.ts'\"");
			expect(result).toBe("/absolute/path/file.ts");
		});

		test("strips wrappers with leading/trailing whitespace", () => {
			const result = resolvePath('  "/absolute/path/file.ts"  ');
			expect(result).toBe("/absolute/path/file.ts");
		});

		test("handles wrappers combined with ~ expansion", () => {
			const result = resolvePath('"~/Documents/file.ts"');
			expect(result).toBe(path.join(homedir, "Documents/file.ts"));
		});

		test("handles wrappers combined with relative paths", () => {
			const result = resolvePath("(src/file.ts)", "/project");
			expect(result).toBe("/project/src/file.ts");
		});
	});
});

describe("stripPathWrappers", () => {
	describe("single wrapper types", () => {
		test("strips double quotes", () => {
			expect(stripPathWrappers('"/path/to/file"')).toBe("/path/to/file");
		});

		test("strips single quotes", () => {
			expect(stripPathWrappers("'/path/to/file'")).toBe("/path/to/file");
		});

		test("strips backticks", () => {
			expect(stripPathWrappers("`/path/to/file`")).toBe("/path/to/file");
		});

		test("strips parentheses", () => {
			expect(stripPathWrappers("(/path/to/file)")).toBe("/path/to/file");
		});

		test("strips square brackets", () => {
			expect(stripPathWrappers("[/path/to/file]")).toBe("/path/to/file");
		});

		test("strips angle brackets", () => {
			expect(stripPathWrappers("</path/to/file>")).toBe("/path/to/file");
		});
	});

	describe("nested wrappers", () => {
		test("strips multiple layers of same wrapper", () => {
			expect(stripPathWrappers('"""/path/to/file"""')).toBe("/path/to/file");
		});

		test("strips mixed nested wrappers", () => {
			expect(stripPathWrappers("\"'/path/to/file'\"")).toBe("/path/to/file");
		});

		test("strips deeply nested mixed wrappers", () => {
			expect(stripPathWrappers("\"('[/path/to/file]')\"")).toBe(
				"/path/to/file",
			);
		});
	});

	describe("edge cases", () => {
		test("returns empty string for empty input", () => {
			expect(stripPathWrappers("")).toBe("");
		});

		test("returns trimmed string for whitespace only", () => {
			expect(stripPathWrappers("   ")).toBe("");
		});

		test("trims surrounding whitespace", () => {
			expect(stripPathWrappers('  "/path/to/file"  ')).toBe("/path/to/file");
		});

		test("does not strip mismatched wrappers", () => {
			expect(stripPathWrappers('"/path/to/file)')).toBe('"/path/to/file)');
		});

		test("does not strip opening wrapper only", () => {
			expect(stripPathWrappers('"/path/to/file')).toBe('"/path/to/file');
		});

		test("does not strip closing wrapper only", () => {
			expect(stripPathWrappers('/path/to/file"')).toBe('/path/to/file"');
		});

		test("preserves path with internal wrappers", () => {
			expect(stripPathWrappers("/path/to/(file)")).toBe("/path/to/(file)");
		});

		test("preserves path with no wrappers", () => {
			expect(stripPathWrappers("/path/to/file")).toBe("/path/to/file");
		});

		test("handles single character inside wrappers", () => {
			expect(stripPathWrappers('"a"')).toBe("a");
		});

		test("handles wrappers with only whitespace inside", () => {
			expect(stripPathWrappers('"  "')).toBe("  ");
		});
	});

	describe("trailing punctuation", () => {
		test("strips trailing period", () => {
			expect(stripPathWrappers("./path/file.ts.")).toBe("./path/file.ts");
		});

		test("strips trailing comma", () => {
			expect(stripPathWrappers("./path/file.ts,")).toBe("./path/file.ts");
		});

		test("strips trailing colon", () => {
			expect(stripPathWrappers("./path/file.ts:")).toBe("./path/file.ts");
		});

		test("strips trailing semicolon", () => {
			expect(stripPathWrappers("./path/file.ts;")).toBe("./path/file.ts");
		});

		test("strips trailing question mark", () => {
			expect(stripPathWrappers("./path/file.ts?")).toBe("./path/file.ts");
		});

		test("strips trailing exclamation", () => {
			expect(stripPathWrappers("./path/file.ts!")).toBe("./path/file.ts");
		});

		test("strips multiple trailing punctuation", () => {
			expect(stripPathWrappers("./path/file.ts..")).toBe("./path/file.ts");
		});

		test("strips mixed trailing punctuation", () => {
			expect(stripPathWrappers("./path/file.ts.,")).toBe("./path/file.ts");
		});

		test("preserves file extension", () => {
			expect(stripPathWrappers("./path/file.ts")).toBe("./path/file.ts");
		});

		test("preserves .json extension", () => {
			expect(stripPathWrappers("./path/file.json")).toBe("./path/file.json");
		});

		test("preserves multi-dot extensions like .test.ts", () => {
			expect(stripPathWrappers("./path/file.test.ts")).toBe(
				"./path/file.test.ts",
			);
		});

		test("preserves line number suffix :42", () => {
			expect(stripPathWrappers("./path/file.ts:42")).toBe("./path/file.ts:42");
		});

		test("preserves line:col suffix :42:10", () => {
			expect(stripPathWrappers("./path/file.ts:42:10")).toBe(
				"./path/file.ts:42:10",
			);
		});
	});

	describe("paths with adjacent tokens around parentheses", () => {
		test("extracts path from text(path)more pattern", () => {
			expect(stripPathWrappers("text(src/file.ts)more")).toBe("src/file.ts");
		});

		test("extracts path from text(./path)more pattern", () => {
			expect(stripPathWrappers("text(./src/file.ts)more")).toBe(
				"./src/file.ts",
			);
		});

		test("extracts path from prefix (path) suffix with spaces", () => {
			expect(stripPathWrappers("see (src/file.ts) for")).toBe("src/file.ts");
		});

		test("extracts path from 'applied to (path)' pattern", () => {
			expect(stripPathWrappers("applied to (src/file.ts)")).toBe("src/file.ts");
		});

		test("extracts path with line number from parentheses", () => {
			expect(stripPathWrappers("in (src/file.ts:42)")).toBe("src/file.ts:42");
		});

		test("extracts path with line:col from parentheses", () => {
			expect(stripPathWrappers("in (src/file.ts:42:10)")).toBe(
				"src/file.ts:42:10",
			);
		});

		test("handles absolute path inside parentheses with prefix", () => {
			expect(stripPathWrappers("see (/absolute/path/file.ts)")).toBe(
				"/absolute/path/file.ts",
			);
		});

		test("handles ~ path inside parentheses with prefix", () => {
			expect(stripPathWrappers("in (~/Documents/file.ts)")).toBe(
				"~/Documents/file.ts",
			);
		});

		test("preserves valid paths with parentheses in directory names", () => {
			expect(stripPathWrappers("/path/dir (copy)/file.ts")).toBe(
				"/path/dir (copy)/file.ts",
			);
		});

		test("handles brackets similar to parentheses", () => {
			expect(stripPathWrappers("see [src/file.ts] here")).toBe("src/file.ts");
		});

		test("handles angle brackets similar to parentheses", () => {
			expect(stripPathWrappers("import <src/file.ts> done")).toBe(
				"src/file.ts",
			);
		});

		test("does not extract non-path content from parentheses", () => {
			expect(stripPathWrappers("text(not a path)more")).toBe(
				"text(not a path)more",
			);
		});

		test("handles nested brackets with path", () => {
			expect(stripPathWrappers("prefix((src/file.ts))suffix")).toBe(
				"src/file.ts",
			);
		});
	});

	describe("wrappers with trailing punctuation", () => {
		test("quoted path with trailing period", () => {
			expect(stripPathWrappers('"./path/file.ts".')).toBe("./path/file.ts");
		});

		test("quoted path with trailing comma", () => {
			expect(stripPathWrappers('"./path/file.ts",')).toBe("./path/file.ts");
		});

		test("parenthesized path with trailing period", () => {
			expect(stripPathWrappers("(./path/file.ts).")).toBe("./path/file.ts");
		});

		test("complex nested with trailing punctuation", () => {
			expect(stripPathWrappers('"(./path/file.ts)".')).toBe("./path/file.ts");
		});
	});

	describe("line numbers with trailing punctuation", () => {
		test("strips trailing period after line number", () => {
			expect(stripPathWrappers("./path/file.ts:42.")).toBe("./path/file.ts:42");
		});

		test("strips trailing comma after line number", () => {
			expect(stripPathWrappers("./path/file.ts:42,")).toBe("./path/file.ts:42");
		});

		test("strips trailing colon after line number", () => {
			expect(stripPathWrappers("./path/file.ts:42:")).toBe("./path/file.ts:42");
		});

		test("strips trailing period after line:col", () => {
			expect(stripPathWrappers("./path/file.ts:42:10.")).toBe(
				"./path/file.ts:42:10",
			);
		});

		test("strips trailing comma after line:col", () => {
			expect(stripPathWrappers("./path/file.ts:42:10,")).toBe(
				"./path/file.ts:42:10",
			);
		});
	});

	describe("various extension types", () => {
		test("preserves numeric extensions like .mp3", () => {
			expect(stripPathWrappers("./path/file.mp3")).toBe("./path/file.mp3");
		});

		test("preserves single character extensions like .c", () => {
			expect(stripPathWrappers("./path/file.c")).toBe("./path/file.c");
		});

		test("preserves uppercase extensions like .TSX", () => {
			expect(stripPathWrappers("./path/file.TSX")).toBe("./path/file.TSX");
		});

		test("preserves dotfiles", () => {
			expect(stripPathWrappers(".gitignore")).toBe(".gitignore");
		});

		test("preserves dotfiles with extension", () => {
			expect(stripPathWrappers(".eslintrc.json")).toBe(".eslintrc.json");
		});

		test("strips trailing period from dotfile with extension", () => {
			expect(stripPathWrappers(".eslintrc.json.")).toBe(".eslintrc.json");
		});
	});
});
