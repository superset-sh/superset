import { describe, expect, mock, test } from "bun:test";
import type { GitClient } from "../shared/types";
import { resolveNewBranchStartPoint } from "./resolve-new-branch-start-point";

interface MockState {
	existingRefs: Set<string>;
	upstreams: Record<string, { remote: string; remoteBranch: string }>;
	defaultBranch?: string;
	fetchThrows?: Error;
}

function createMockGit(state: MockState) {
	const fetch = mock(async (_args: string[]) => {
		if (state.fetchThrows) throw state.fetchThrows;
		return "";
	});
	const raw = mock(async (args: string[]) => {
		if (args[0] === "rev-parse" && args[1] === "--verify") {
			const ref = args[2]?.replace("^{commit}", "") ?? "";
			if (state.existingRefs.has(ref)) return `${"0".repeat(40)}\n`;
			throw new Error("fatal: Needed a single revision");
		}
		if (args[0] === "symbolic-ref" && args[1] === "refs/remotes/origin/HEAD") {
			if (state.defaultBranch) return `origin/${state.defaultBranch}`;
			throw new Error("fatal: ref is not a symbolic ref");
		}
		if (args[0] === "config" && args[1] === "--get") {
			// branch.<name>.remote / branch.<name>.merge
			const key = args[2] ?? "";
			const match = key.match(/^branch\.(.+)\.(remote|merge)$/);
			if (!match) throw new Error("no such key");
			const [, branch, kind] = match;
			const upstream = branch ? state.upstreams[branch] : undefined;
			if (!upstream) throw new Error("no such key");
			return kind === "remote"
				? upstream.remote
				: `refs/heads/${upstream.remoteBranch}`;
		}
		throw new Error(`Unexpected raw args: ${args.join(" ")}`);
	});
	return { raw, fetch } as unknown as GitClient & {
		fetch: typeof fetch;
	};
}

describe("resolveNewBranchStartPoint", () => {
	// The core regression: a non-default shared branch (e.g. `mirror-flier`)
	// whose local ref is weeks stale must still get its upstream fetched
	// before it's used as a fork point, or new workspaces open on the stale
	// tip.
	test("upgrades and fetches non-default local branch that has an upstream", async () => {
		const git = createMockGit({
			existingRefs: new Set([
				"refs/heads/mirror-flier",
				"refs/remotes/origin/mirror-flier",
			]),
			upstreams: {
				"mirror-flier": { remote: "origin", remoteBranch: "mirror-flier" },
			},
			defaultBranch: "main",
		});

		const result = await resolveNewBranchStartPoint(git, "mirror-flier");

		expect(result.kind).toBe("remote-tracking");
		if (result.kind === "remote-tracking") {
			expect(result.remoteShortName).toBe("origin/mirror-flier");
		}
		expect(git.fetch).toHaveBeenCalledWith([
			"origin",
			"mirror-flier",
			"--quiet",
			"--no-tags",
		]);
	});

	test("upgrades and fetches the default branch (unchanged behavior)", async () => {
		const git = createMockGit({
			existingRefs: new Set(["refs/heads/main", "refs/remotes/origin/main"]),
			upstreams: { main: { remote: "origin", remoteBranch: "main" } },
			defaultBranch: "main",
		});

		const result = await resolveNewBranchStartPoint(git, "main");

		expect(result.kind).toBe("remote-tracking");
		expect(git.fetch).toHaveBeenCalledWith([
			"origin",
			"main",
			"--quiet",
			"--no-tags",
		]);
	});

	test("keeps local when no upstream is configured (workspace branch)", async () => {
		const git = createMockGit({
			existingRefs: new Set(["refs/heads/agreeable-ermine"]),
			upstreams: {},
		});

		const result = await resolveNewBranchStartPoint(git, "agreeable-ermine");

		expect(result.kind).toBe("local");
		expect(git.fetch).not.toHaveBeenCalled();
	});

	test("keeps local when configured upstream ref doesn't exist locally", async () => {
		// resolveUpstream succeeds but rev-parse origin/foo fails.
		const git = createMockGit({
			existingRefs: new Set(["refs/heads/foo"]),
			upstreams: { foo: { remote: "origin", remoteBranch: "foo" } },
		});

		const result = await resolveNewBranchStartPoint(git, "foo");

		expect(result.kind).toBe("local");
		expect(git.fetch).not.toHaveBeenCalled();
	});

	test("swallows fetch errors and still returns the resolved start point", async () => {
		const git = createMockGit({
			existingRefs: new Set(["refs/heads/main", "refs/remotes/origin/main"]),
			upstreams: { main: { remote: "origin", remoteBranch: "main" } },
			fetchThrows: new Error("network unreachable"),
		});

		const result = await resolveNewBranchStartPoint(git, "main");

		expect(result.kind).toBe("remote-tracking");
		expect(git.fetch).toHaveBeenCalled();
	});
});
