/*---------------------------------------------------------------------------------------------
 *  Link resolver tests — adapted from VSCode's terminalLinkResolver.test.ts
 *  https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminalContrib/links/test/browser/terminalLinkResolver.test.ts
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";
import {
	type LinkResolverOptions,
	type ResolvedLink,
	TerminalLinkResolver,
} from "./link-resolver";

describe("TerminalLinkResolver", () => {
	let resolver: TerminalLinkResolver;
	let statMock: jest.Mock<(path: string) => Promise<{ isDirectory: boolean } | null>>;

	beforeEach(() => {
		statMock = jest.fn();
		resolver = new TerminalLinkResolver(statMock);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	const defaultOpts: LinkResolverOptions = {
		initialCwd: "/parent/cwd",
		userHome: "/home/user",
	};

	describe("resolveLink", () => {
		it("should resolve absolute paths", async () => {
			statMock.mockResolvedValue({ isDirectory: false });
			const result = await resolver.resolveLink("/foo/bar.ts", defaultOpts);
			expect(result).toEqual({
				path: "/foo/bar.ts",
				isDirectory: false,
			});
			expect(statMock).toHaveBeenCalledWith("/foo/bar.ts");
		});

		it("should resolve tilde paths", async () => {
			statMock.mockResolvedValue({ isDirectory: false });
			const result = await resolver.resolveLink("~/projects/foo.ts", defaultOpts);
			expect(result).toEqual({
				path: "/home/user/projects/foo.ts",
				isDirectory: false,
			});
			expect(statMock).toHaveBeenCalledWith("/home/user/projects/foo.ts");
		});

		it("should resolve relative paths against initialCwd", async () => {
			statMock.mockResolvedValue({ isDirectory: false });
			const result = await resolver.resolveLink("./src/file.ts", defaultOpts);
			expect(result).toEqual({
				path: "/parent/cwd/src/file.ts",
				isDirectory: false,
			});
		});

		it("should resolve bare relative paths against initialCwd", async () => {
			statMock.mockResolvedValue({ isDirectory: false });
			const result = await resolver.resolveLink("src/file.ts", defaultOpts);
			expect(result).toEqual({
				path: "/parent/cwd/src/file.ts",
				isDirectory: false,
			});
		});

		it("should resolve parent paths against initialCwd", async () => {
			statMock.mockResolvedValue({ isDirectory: false });
			const result = await resolver.resolveLink("../foo.ts", defaultOpts);
			expect(result).toEqual({
				path: "/parent/foo.ts",
				isDirectory: false,
			});
		});

		it("should return null for paths that don't exist", async () => {
			statMock.mockResolvedValue(null);
			const result = await resolver.resolveLink("/nonexistent.ts", defaultOpts);
			expect(result).toBeNull();
		});

		it("should return null for stat errors", async () => {
			statMock.mockRejectedValue(new Error("ENOENT"));
			const result = await resolver.resolveLink("/nonexistent.ts", defaultOpts);
			expect(result).toBeNull();
		});

		it("should return null when initialCwd is missing for relative paths", async () => {
			const result = await resolver.resolveLink("src/file.ts", {
				initialCwd: undefined,
				userHome: "/home/user",
			});
			expect(result).toBeNull();
			expect(statMock).not.toHaveBeenCalled();
		});

		it("should return null when userHome is missing for tilde paths", async () => {
			const result = await resolver.resolveLink("~/foo.ts", {
				initialCwd: "/parent/cwd",
				userHome: undefined,
			});
			expect(result).toBeNull();
			expect(statMock).not.toHaveBeenCalled();
		});

		it("should detect directories", async () => {
			statMock.mockResolvedValue({ isDirectory: true });
			const result = await resolver.resolveLink("/some/dir", defaultOpts);
			expect(result).toEqual({
				path: "/some/dir",
				isDirectory: true,
			});
		});

		it("should strip file:// URI scheme", async () => {
			statMock.mockResolvedValue({ isDirectory: false });
			const result = await resolver.resolveLink("file:///foo/bar.ts", defaultOpts);
			expect(result).toEqual({
				path: "/foo/bar.ts",
				isDirectory: false,
			});
		});

		it("should decode URL-encoded paths", async () => {
			statMock.mockResolvedValue({ isDirectory: false });
			const result = await resolver.resolveLink("file:///foo/bar%20baz.ts", defaultOpts);
			expect(result).toEqual({
				path: "/foo/bar baz.ts",
				isDirectory: false,
			});
		});

		it("should return null for empty paths", async () => {
			const result = await resolver.resolveLink("", defaultOpts);
			expect(result).toBeNull();
		});

		it("should return null for whitespace-only paths", async () => {
			const result = await resolver.resolveLink("   ", defaultOpts);
			expect(result).toBeNull();
		});
	});

	describe("caching", () => {
		it("should cache resolved results", async () => {
			statMock.mockResolvedValue({ isDirectory: false });
			await resolver.resolveLink("/foo/bar.ts", defaultOpts);
			await resolver.resolveLink("/foo/bar.ts", defaultOpts);
			expect(statMock).toHaveBeenCalledTimes(1);
		});

		it("should cache null results", async () => {
			statMock.mockResolvedValue(null);
			await resolver.resolveLink("/nonexistent.ts", defaultOpts);
			await resolver.resolveLink("/nonexistent.ts", defaultOpts);
			expect(statMock).toHaveBeenCalledTimes(1);
		});

		it("should expire cache after TTL", async () => {
			statMock.mockResolvedValue({ isDirectory: false });
			// Use a short TTL for testing
			resolver = new TerminalLinkResolver(statMock, { cacheTtlMs: 50 });
			await resolver.resolveLink("/foo/bar.ts", defaultOpts);
			expect(statMock).toHaveBeenCalledTimes(1);

			// Wait for cache to expire
			await new Promise((r) => setTimeout(r, 60));

			await resolver.resolveLink("/foo/bar.ts", defaultOpts);
			expect(statMock).toHaveBeenCalledTimes(2);
		});

		it("should cache different paths independently", async () => {
			statMock.mockImplementation(async (path) => {
				if (path === "/foo.ts") return { isDirectory: false };
				return null;
			});

			const r1 = await resolver.resolveLink("/foo.ts", defaultOpts);
			const r2 = await resolver.resolveLink("/bar.ts", defaultOpts);

			expect(r1).not.toBeNull();
			expect(r2).toBeNull();
			expect(statMock).toHaveBeenCalledTimes(2);
		});
	});

	describe("resolveMultipleCandidates", () => {
		it("should return the first candidate that exists", async () => {
			statMock.mockImplementation(async (path) => {
				if (path === "/parent/cwd/bar.ts") return { isDirectory: false };
				return null;
			});

			const result = await resolver.resolveMultipleCandidates(
				["foo.ts", "bar.ts", "baz.ts"],
				defaultOpts,
			);
			expect(result).toEqual({
				path: "/parent/cwd/bar.ts",
				isDirectory: false,
			});
		});

		it("should return null when no candidates exist", async () => {
			statMock.mockResolvedValue(null);
			const result = await resolver.resolveMultipleCandidates(
				["foo.ts", "bar.ts"],
				defaultOpts,
			);
			expect(result).toBeNull();
		});

		it("should return null for empty candidate list", async () => {
			const result = await resolver.resolveMultipleCandidates([], defaultOpts);
			expect(result).toBeNull();
		});
	});
});
