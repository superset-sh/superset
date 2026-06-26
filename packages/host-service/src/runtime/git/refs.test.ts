import { describe, expect, mock, test } from "bun:test";
import {
	asLocalRef,
	asRemoteRef,
	resolveRef,
	resolveRefCaseInsensitive,
} from "./refs";

/**
 * Mock git that knows about a fixed set of FULL refnames. Mirrors how
 * `resolveRef` probes (always with `refs/heads/...` / `refs/remotes/.../...`
 * / `refs/tags/...`).
 */
function createMockGit(existingFullRefs: Set<string>) {
	return {
		raw: mock(async (args: string[]) => {
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

/**
 * `resolveRefCaseInsensitive` calls `for-each-ref` rather than probing
 * single refs, so it needs a different mock — one that returns the full
 * stored refnames as a newline-separated list.
 */
function createForEachRefMock(refnames: string[]) {
	return {
		raw: mock(async (args: string[]) => {
			if (args[0] === "for-each-ref") {
				return `${refnames.join("\n")}\n`;
			}
			throw new Error(`Unexpected raw args: ${args.join(" ")}`);
		}),
	} as never;
}

describe("resolveRefCaseInsensitive", () => {
	test("returns canonical-case local ref when input differs only by case", async () => {
		const git = createForEachRefMock(["refs/heads/Claude/Auto-Balance-1UFT7"]);
		const r = await resolveRefCaseInsensitive(git, "claude/auto-balance-1uft7");
		expect(r?.kind).toBe("local");
		if (r?.kind === "local") {
			expect(r.shortName).toBe("Claude/Auto-Balance-1UFT7");
			expect(r.fullRef).toBe("refs/heads/Claude/Auto-Balance-1UFT7");
		}
	});

	test("returns remote-tracking ref when only the remote ref matches case-insensitively", async () => {
		const git = createForEachRefMock([
			"refs/remotes/origin/claude/Auto-Balance-1UFT7",
		]);
		const r = await resolveRefCaseInsensitive(git, "claude/auto-balance-1uft7");
		expect(r?.kind).toBe("remote-tracking");
		if (r?.kind === "remote-tracking") {
			expect(r.shortName).toBe("claude/Auto-Balance-1UFT7");
			expect(r.remoteShortName).toBe("origin/claude/Auto-Balance-1UFT7");
		}
	});

	test("local match wins when both local and remote-tracking match", async () => {
		const git = createForEachRefMock([
			"refs/remotes/origin/Foo-Bar",
			"refs/heads/foo-BAR",
		]);
		const r = await resolveRefCaseInsensitive(git, "FOO-bar");
		expect(r?.kind).toBe("local");
		if (r?.kind === "local") {
			expect(r.shortName).toBe("foo-BAR");
		}
	});

	test("returns null when nothing matches case-insensitively", async () => {
		const git = createForEachRefMock([
			"refs/heads/main",
			"refs/remotes/origin/main",
		]);
		expect(await resolveRefCaseInsensitive(git, "totally-other")).toBeNull();
	});

	test("strips a leading `<remote>/` prefix before matching", async () => {
		const git = createForEachRefMock(["refs/remotes/origin/Feature-X"]);
		const r = await resolveRefCaseInsensitive(git, "origin/feature-x");
		expect(r?.kind).toBe("remote-tracking");
		if (r?.kind === "remote-tracking") {
			expect(r.shortName).toBe("Feature-X");
		}
	});

	test("ignores `refs/remotes/<remote>/HEAD`", async () => {
		const git = createForEachRefMock([
			"refs/remotes/origin/HEAD",
			"refs/heads/main",
		]);
		// `head` should NOT case-insensitive-match `HEAD`.
		expect(await resolveRefCaseInsensitive(git, "head")).toBeNull();
	});

	test("empty/whitespace input → null", async () => {
		const git = createForEachRefMock(["refs/heads/foo"]);
		expect(await resolveRefCaseInsensitive(git, "")).toBeNull();
		expect(await resolveRefCaseInsensitive(git, "   ")).toBeNull();
	});
});
