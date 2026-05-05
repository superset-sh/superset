import { describe, expect, mock, test } from "bun:test";
import { asLocalRef, asRemoteRef, resolveRef } from "./refs";

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
