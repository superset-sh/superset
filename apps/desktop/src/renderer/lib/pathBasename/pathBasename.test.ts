import { describe, expect, it } from "bun:test";
import { getBaseName } from "./pathBasename";

describe("getBaseName", () => {
	describe("posix paths", () => {
		it("returns the final segment of a standard absolute path", () => {
			expect(getBaseName("/Users/alice/projects/superset")).toBe("superset");
		});

		it("returns the final segment when the path has a file extension", () => {
			expect(getBaseName("/workspace/nested/notes.txt")).toBe("notes.txt");
		});

		it("returns the last non-empty segment for a trailing slash", () => {
			expect(getBaseName("/Users/alice/projects/superset/")).toBe("superset");
		});

		it("collapses multiple trailing slashes", () => {
			expect(getBaseName("/Users/alice/projects/superset///")).toBe("superset");
		});

		it("returns the single segment when path has no separators", () => {
			expect(getBaseName("superset")).toBe("superset");
		});

		it("returns the segment for a single-segment absolute path", () => {
			expect(getBaseName("/superset")).toBe("superset");
		});

		it("preserves dots in folder names", () => {
			expect(getBaseName("/Users/alice/my.project.v2")).toBe("my.project.v2");
		});

		it("preserves a dotfile folder name", () => {
			expect(getBaseName("/Users/alice/.config")).toBe(".config");
		});

		it("preserves spaces in folder names", () => {
			expect(getBaseName("/Users/alice/My Cool Project")).toBe(
				"My Cool Project",
			);
		});

		it("preserves unicode characters in folder names", () => {
			expect(getBaseName("/Users/alice/プロジェクト")).toBe("プロジェクト");
		});

		it("preserves emoji in folder names", () => {
			expect(getBaseName("/Users/alice/🚀-rocket")).toBe("🚀-rocket");
		});

		it("handles consecutive internal slashes", () => {
			expect(getBaseName("/Users//alice///projects/superset")).toBe("superset");
		});
	});

	describe("windows paths", () => {
		it("returns the final segment of a backslash path", () => {
			expect(getBaseName("C:\\Users\\alice\\projects\\superset")).toBe(
				"superset",
			);
		});

		it("handles a trailing backslash", () => {
			expect(getBaseName("C:\\Users\\alice\\projects\\superset\\")).toBe(
				"superset",
			);
		});

		it("handles mixed forward and back slashes", () => {
			expect(getBaseName("C:\\Users\\alice/projects\\superset")).toBe(
				"superset",
			);
		});

		it("handles UNC-style paths", () => {
			expect(getBaseName("\\\\server\\share\\project")).toBe("project");
		});

		it("handles consecutive trailing backslashes", () => {
			expect(getBaseName("C:\\Users\\alice\\superset\\\\\\")).toBe("superset");
		});
	});

	describe("edge cases", () => {
		it("returns the original input for an empty string", () => {
			expect(getBaseName("")).toBe("");
		});

		it("returns the original input for only forward slashes", () => {
			expect(getBaseName("/")).toBe("/");
		});

		it("returns the original input for multiple forward slashes", () => {
			expect(getBaseName("///")).toBe("///");
		});

		it("returns the original input for only backslashes", () => {
			expect(getBaseName("\\")).toBe("\\");
		});

		it("returns the drive letter for a windows drive root", () => {
			expect(getBaseName("C:\\")).toBe("C:");
		});

		it("preserves a relative path final segment", () => {
			expect(getBaseName("projects/superset")).toBe("superset");
		});

		it("preserves a dot-relative path final segment", () => {
			expect(getBaseName("./projects/superset")).toBe("superset");
		});

		it("returns '..' for a parent-directory-only input", () => {
			expect(getBaseName("..")).toBe("..");
		});

		it("returns '.' for a current-directory input", () => {
			expect(getBaseName(".")).toBe(".");
		});

		it("preserves hyphens and underscores in names", () => {
			expect(getBaseName("/tmp/my-cool_project-2")).toBe("my-cool_project-2");
		});
	});
});
