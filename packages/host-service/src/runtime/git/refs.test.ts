import { describe, expect, mock, test } from "bun:test";
import { asLocalRef, asRemoteRef, resolveRef } from "./refs";

/**
 * Mock git that knows about a fixed set of FULL refnames. Mirrors how
 * `resolveRef` looks refs up: branch enumeration via `for-each-ref`
 * (which reports refnames exactly as stored, case-sensitively) and tag
 * probes via `rev-parse --verify`.
 */
function createMockGit(existingFullRefs: Set<string>) {
	return {
		raw: mock(async (args: string[]) => {
			if (args[0] === "for-each-ref") {
				const prefixes = args.filter((arg) => arg.startsWith("refs/"));
				const lines = [...existingFullRefs].filter((ref) =>
					prefixes.some((prefix) => ref.startsWith(prefix)),
				);
				return lines.length > 0 ? `${lines.join("\n")}\n` : "";
			}
			if (args[0] === "rev-parse" && args[1] === "--verify") {
				const ref = args[2]?.replace("^{commit}", "") ?? "";
				if (existingFullRefs.has(ref)) {
					return `${"0".repeat(40)}\n`;
				}
				throw new Error("fatal: Needed a single revision");
			}
			throw new Error(`Unexpected raw args: ${args.join(" ")}`);
		}),
	} as never;
}

describe("asLocalRef / asRemoteRef", () => {
	test("asLocalRef wraps as refs/heads/", () => {
		expect(asLocalRef("foo")).toBe("refs/heads/foo");
		expect(asLocalRef("origin/foo")).toBe("refs/heads/origin/foo");
	});

	test("asRemoteRef wraps as refs/remotes/<remote>/", () => {
		expect(asRemoteRef("origin", "foo")).toBe("refs/remotes/origin/foo");
		expect(asRemoteRef("upstream", "main")).toBe("refs/remotes/upstream/main");
	});
});

describe("resolveRef — input shape contract", () => {
	test("bare name resolves to local when local exists", async () => {
		const git = createMockGit(new Set(["refs/heads/foo"]));
		const r = await resolveRef(git, "foo");
		expect(r?.kind).toBe("local");
		if (r?.kind === "local") {
			expect(r.shortName).toBe("foo");
			expect(r.fullRef).toBe("refs/heads/foo");
		}
	});

	test("bare name resolves to remote-tracking when only remote exists", async () => {
		const git = createMockGit(new Set(["refs/remotes/origin/foo"]));
		const r = await resolveRef(git, "foo");
		expect(r?.kind).toBe("remote-tracking");
		if (r?.kind === "remote-tracking") {
			expect(r.shortName).toBe("foo");
			expect(r.remote).toBe("origin");
			expect(r.remoteShortName).toBe("origin/foo");
			expect(r.fullRef).toBe("refs/remotes/origin/foo");
		}
	});

	// Regression: previously `resolveRef("origin/foo")` probed
	// `refs/remotes/origin/origin/foo` (double prefix) and returned null.
	test("`origin/foo` shortform resolves to remote-tracking", async () => {
		const git = createMockGit(new Set(["refs/remotes/origin/foo"]));
		const r = await resolveRef(git, "origin/foo");
		expect(r?.kind).toBe("remote-tracking");
		if (r?.kind === "remote-tracking") {
			expect(r.shortName).toBe("foo");
			expect(r.remoteShortName).toBe("origin/foo");
			expect(r.fullRef).toBe("refs/remotes/origin/foo");
		}
	});

	// Regression: a local branch literally named `origin/foo` must classify
	// as local (NOT remote-tracking), because local always wins. This is the
	// original bug class that motivated `ResolvedRef`.
	test("local branch named `origin/foo` resolves to local, not remote", async () => {
		const git = createMockGit(new Set(["refs/heads/origin/foo"]));
		const r = await resolveRef(git, "origin/foo");
		expect(r?.kind).toBe("local");
		if (r?.kind === "local") {
			expect(r.shortName).toBe("origin/foo");
			expect(r.fullRef).toBe("refs/heads/origin/foo");
		}
	});

	// Verify precedence when both forms exist: local wins.
	test("when both `refs/heads/origin/foo` and `refs/remotes/origin/foo` exist, local wins", async () => {
		const git = createMockGit(
			new Set(["refs/heads/origin/foo", "refs/remotes/origin/foo"]),
		);
		const r = await resolveRef(git, "origin/foo");
		expect(r?.kind).toBe("local");
	});

	test("tag-only ref resolves to kind: tag", async () => {
		const git = createMockGit(new Set(["refs/tags/v1.0"]));
		const r = await resolveRef(git, "v1.0");
		expect(r?.kind).toBe("tag");
		if (r?.kind === "tag") {
			expect(r.shortName).toBe("v1.0");
			expect(r.fullRef).toBe("refs/tags/v1.0");
		}
	});

	test("nothing matches → null when headFallback is false (default)", async () => {
		const git = createMockGit(new Set());
		const r = await resolveRef(git, "missing");
		expect(r).toBeNull();
	});

	test("nothing matches → kind: head when headFallback is true", async () => {
		const git = createMockGit(new Set());
		const r = await resolveRef(git, "missing", { headFallback: true });
		expect(r?.kind).toBe("head");
	});

	test("empty/whitespace input → null (or head with fallback)", async () => {
		const git = createMockGit(new Set(["refs/heads/foo"]));
		expect(await resolveRef(git, "")).toBeNull();
		expect(await resolveRef(git, "   ")).toBeNull();
		const r = await resolveRef(git, "", { headFallback: true });
		expect(r?.kind).toBe("head");
	});

	// Case drift: on case-insensitive filesystems a differently-cased branch
	// name shares the existing branch's loose-ref file, so creating a
	// "new" case-twin silently corrupts the existing branch. resolveRef must
	// adopt the canonical casing instead of reporting a miss.
	test("adopts canonical casing of an existing local branch", async () => {
		const git = createMockGit(new Set(["refs/heads/Roshvan/fix-thing"]));
		const r = await resolveRef(git, "roshvan/fix-thing");
		expect(r?.kind).toBe("local");
		if (r?.kind === "local") {
			expect(r.shortName).toBe("Roshvan/fix-thing");
			expect(r.fullRef).toBe("refs/heads/Roshvan/fix-thing");
		}
	});

	test("adopts canonical casing of an existing remote branch", async () => {
		const git = createMockGit(
			new Set(["refs/remotes/origin/Roshvan/fix-thing"]),
		);
		const r = await resolveRef(git, "roshvan/fix-thing");
		expect(r?.kind).toBe("remote-tracking");
		if (r?.kind === "remote-tracking") {
			expect(r.shortName).toBe("Roshvan/fix-thing");
			expect(r.remoteShortName).toBe("origin/Roshvan/fix-thing");
			expect(r.fullRef).toBe("refs/remotes/origin/Roshvan/fix-thing");
		}
	});

	test("exact remote match beats a case-twin local branch", async () => {
		const git = createMockGit(
			new Set(["refs/heads/Foo", "refs/remotes/origin/foo"]),
		);
		const r = await resolveRef(git, "foo");
		expect(r?.kind).toBe("remote-tracking");
		if (r?.kind === "remote-tracking") {
			expect(r.shortName).toBe("foo");
		}
	});

	test("exact tag match beats a case-twin branch", async () => {
		const git = createMockGit(new Set(["refs/heads/Foo", "refs/tags/foo"]));
		const r = await resolveRef(git, "foo");
		expect(r?.kind).toBe("tag");
	});

	test("`head` does not case-insensitively match refs/remotes/origin/HEAD", async () => {
		const git = createMockGit(
			new Set(["refs/remotes/origin/HEAD", "refs/heads/main"]),
		);
		expect(await resolveRef(git, "head")).toBeNull();
	});

	// A genuine for-each-ref failure must propagate, not degrade to "no
	// branches" — masking it would make an existing branch look absent and let
	// a case-twin be created (the bug this module exists to prevent).
	test("propagates a for-each-ref failure instead of returning null", async () => {
		const git = {
			raw: mock(async (args: string[]) => {
				if (args[0] === "for-each-ref") {
					throw new Error("fatal: not a git repository");
				}
				throw new Error(`Unexpected raw args: ${args.join(" ")}`);
			}),
		} as never;
		const originalWarn = console.warn;
		console.warn = () => {};
		try {
			await expect(resolveRef(git, "foo")).rejects.toThrow(
				"not a git repository",
			);
		} finally {
			console.warn = originalWarn;
		}
	});

	test("custom remote name probes that remote, not origin", async () => {
		const git = createMockGit(new Set(["refs/remotes/upstream/foo"]));
		const r = await resolveRef(git, "foo", { remote: "upstream" });
		expect(r?.kind).toBe("remote-tracking");
		if (r?.kind === "remote-tracking") {
			expect(r.remote).toBe("upstream");
			expect(r.remoteShortName).toBe("upstream/foo");
		}
	});
});
