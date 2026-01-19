import { describe, expect, it } from "bun:test";
import { normalizeFilePath } from "./normalizeFilePath";

describe("normalizeFilePath", () => {
	const workspaceCwd = "/Users/test/project";

	describe("relative paths", () => {
		it("should return relative paths unchanged", () => {
			const result = normalizeFilePath("src/index.ts", workspaceCwd);
			expect(result).toEqual({ type: "relative", path: "src/index.ts" });
		});

		it("should handle nested relative paths", () => {
			const result = normalizeFilePath(
				"src/components/Button.tsx",
				workspaceCwd,
			);
			expect(result).toEqual({
				type: "relative",
				path: "src/components/Button.tsx",
			});
		});

		it("should handle relative paths with dots", () => {
			const result = normalizeFilePath("./src/index.ts", workspaceCwd);
			expect(result).toEqual({ type: "relative", path: "./src/index.ts" });
		});
	});

	describe("absolute paths inside workspace", () => {
		it("should convert absolute workspace paths to relative", () => {
			const result = normalizeFilePath(
				"/Users/test/project/src/index.ts",
				workspaceCwd,
			);
			expect(result).toEqual({ type: "relative", path: "src/index.ts" });
		});

		it("should handle deeply nested paths inside workspace", () => {
			const result = normalizeFilePath(
				"/Users/test/project/src/components/ui/Button.tsx",
				workspaceCwd,
			);
			expect(result).toEqual({
				type: "relative",
				path: "src/components/ui/Button.tsx",
			});
		});

		it("should return workspace-root when path equals workspaceCwd", () => {
			const result = normalizeFilePath("/Users/test/project", workspaceCwd);
			expect(result).toEqual({ type: "workspace-root" });
		});
	});

	describe("absolute paths outside workspace", () => {
		it("should identify paths outside workspace", () => {
			const result = normalizeFilePath("/Users/other/file.ts", workspaceCwd);
			expect(result).toEqual({
				type: "absolute-outside-workspace",
				path: "/Users/other/file.ts",
			});
		});

		it("should not incorrectly match similar prefixes", () => {
			// /Users/test/project-other should NOT match /Users/test/project
			const result = normalizeFilePath(
				"/Users/test/project-other/file.ts",
				workspaceCwd,
			);
			expect(result).toEqual({
				type: "absolute-outside-workspace",
				path: "/Users/test/project-other/file.ts",
			});
		});

		it("should handle root paths", () => {
			const result = normalizeFilePath("/etc/hosts", workspaceCwd);
			expect(result).toEqual({
				type: "absolute-outside-workspace",
				path: "/etc/hosts",
			});
		});
	});

	describe("edge cases", () => {
		it("should handle workspace with trailing content in similar paths", () => {
			// Ensure /repo doesn't match /repo-other
			const result = normalizeFilePath("/repo-other/file.ts", "/repo");
			expect(result).toEqual({
				type: "absolute-outside-workspace",
				path: "/repo-other/file.ts",
			});
		});

		it("should handle empty file name", () => {
			const result = normalizeFilePath("/Users/test/project/", workspaceCwd);
			// Path ending with / will have empty string after stripping prefix
			expect(result).toEqual({ type: "relative", path: "" });
		});
	});
});
