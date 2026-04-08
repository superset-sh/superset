/*---------------------------------------------------------------------------------------------
 *  Link resolver tests
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";
import { TerminalLinkResolver } from "./link-resolver";

describe("TerminalLinkResolver", () => {
	let resolver: TerminalLinkResolver;
	let statMock: jest.Mock<
		(path: string) => Promise<{
			isDirectory: boolean;
			resolvedPath?: string;
		} | null>
	>;

	beforeEach(() => {
		statMock = jest.fn();
		resolver = new TerminalLinkResolver(statMock);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe("resolveLink", () => {
		it("should pass path to stat callback", async () => {
			statMock.mockResolvedValue({ isDirectory: false });
			const result = await resolver.resolveLink("/foo/bar.ts");
			expect(result).toEqual({
				path: "/foo/bar.ts",
				isDirectory: false,
			});
			expect(statMock).toHaveBeenCalledWith("/foo/bar.ts");
		});

		it("should pass relative paths through to stat (host resolves)", async () => {
			statMock.mockResolvedValue({
				isDirectory: false,
				resolvedPath: "/workspace/src/file.ts",
			});
			const result = await resolver.resolveLink("src/file.ts");
			expect(result).toEqual({
				path: "/workspace/src/file.ts",
				isDirectory: false,
			});
			expect(statMock).toHaveBeenCalledWith("src/file.ts");
		});

		it("should pass tilde paths through to stat (host resolves)", async () => {
			statMock.mockResolvedValue({
				isDirectory: false,
				resolvedPath: "/home/user/foo.ts",
			});
			const result = await resolver.resolveLink("~/foo.ts");
			expect(result).toEqual({
				path: "/home/user/foo.ts",
				isDirectory: false,
			});
			expect(statMock).toHaveBeenCalledWith("~/foo.ts");
		});

		it("should prefer resolvedPath from stat over input path", async () => {
			statMock.mockResolvedValue({
				isDirectory: false,
				resolvedPath: "/absolute/resolved/file.ts",
			});
			const result = await resolver.resolveLink("file.ts");
			expect(result?.path).toBe("/absolute/resolved/file.ts");
		});

		it("should fall back to input path when resolvedPath not provided", async () => {
			statMock.mockResolvedValue({ isDirectory: false });
			const result = await resolver.resolveLink("/foo/bar.ts");
			expect(result?.path).toBe("/foo/bar.ts");
		});

		it("should return null for paths that don't exist", async () => {
			statMock.mockResolvedValue(null);
			const result = await resolver.resolveLink("/nonexistent.ts");
			expect(result).toBeNull();
		});

		it("should return null for stat errors", async () => {
			statMock.mockRejectedValue(new Error("ENOENT"));
			const result = await resolver.resolveLink("/nonexistent.ts");
			expect(result).toBeNull();
		});

		it("should detect directories", async () => {
			statMock.mockResolvedValue({ isDirectory: true });
			const result = await resolver.resolveLink("/some/dir");
			expect(result).toEqual({
				path: "/some/dir",
				isDirectory: true,
			});
		});

		it("should strip file:// URI scheme before calling stat", async () => {
			statMock.mockResolvedValue({ isDirectory: false });
			await resolver.resolveLink("file:///foo/bar.ts");
			expect(statMock).toHaveBeenCalledWith("/foo/bar.ts");
		});

		it("should decode URL-encoded file:// paths", async () => {
			statMock.mockResolvedValue({ isDirectory: false });
			await resolver.resolveLink("file:///foo/bar%20baz.ts");
			expect(statMock).toHaveBeenCalledWith("/foo/bar baz.ts");
		});

		it("should strip line/column suffix before calling stat", async () => {
			statMock.mockResolvedValue({ isDirectory: false });
			await resolver.resolveLink("/foo/bar.ts:42:10");
			expect(statMock).toHaveBeenCalledWith("/foo/bar.ts");
		});

		it("should return null for empty paths", async () => {
			const result = await resolver.resolveLink("");
			expect(result).toBeNull();
		});

		it("should return null for whitespace-only paths", async () => {
			const result = await resolver.resolveLink("   ");
			expect(result).toBeNull();
		});
	});

	describe("caching", () => {
		it("should cache resolved results", async () => {
			statMock.mockResolvedValue({ isDirectory: false });
			await resolver.resolveLink("/foo/bar.ts");
			await resolver.resolveLink("/foo/bar.ts");
			expect(statMock).toHaveBeenCalledTimes(1);
		});

		it("should cache null results", async () => {
			statMock.mockResolvedValue(null);
			await resolver.resolveLink("/nonexistent.ts");
			await resolver.resolveLink("/nonexistent.ts");
			expect(statMock).toHaveBeenCalledTimes(1);
		});

		it("should expire cache after TTL", async () => {
			statMock.mockResolvedValue({ isDirectory: false });
			resolver = new TerminalLinkResolver(statMock, { cacheTtlMs: 50 });
			await resolver.resolveLink("/foo/bar.ts");
			expect(statMock).toHaveBeenCalledTimes(1);

			await new Promise((r) => setTimeout(r, 60));

			await resolver.resolveLink("/foo/bar.ts");
			expect(statMock).toHaveBeenCalledTimes(2);
		});

		it("should cache different paths independently", async () => {
			statMock.mockImplementation(async (path) => {
				if (path === "/foo.ts") return { isDirectory: false };
				return null;
			});

			const r1 = await resolver.resolveLink("/foo.ts");
			const r2 = await resolver.resolveLink("/bar.ts");

			expect(r1).not.toBeNull();
			expect(r2).toBeNull();
			expect(statMock).toHaveBeenCalledTimes(2);
		});
	});

	describe("resolveMultipleCandidates", () => {
		it("should return the first candidate that exists", async () => {
			statMock.mockImplementation(async (path) => {
				if (path === "bar.ts")
					return { isDirectory: false, resolvedPath: "/workspace/bar.ts" };
				return null;
			});

			const result = await resolver.resolveMultipleCandidates([
				"foo.ts",
				"bar.ts",
				"baz.ts",
			]);
			expect(result).toEqual({
				path: "/workspace/bar.ts",
				isDirectory: false,
			});
		});

		it("should return null when no candidates exist", async () => {
			statMock.mockResolvedValue(null);
			const result = await resolver.resolveMultipleCandidates([
				"foo.ts",
				"bar.ts",
			]);
			expect(result).toBeNull();
		});

		it("should return null for empty candidate list", async () => {
			const result = await resolver.resolveMultipleCandidates([]);
			expect(result).toBeNull();
		});
	});
});
