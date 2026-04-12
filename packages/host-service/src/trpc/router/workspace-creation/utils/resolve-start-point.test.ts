import { describe, expect, mock, test } from "bun:test";
import { resolveStartPoint } from "./resolve-start-point";

function createMockGit(existingRefs: Set<string>) {
	return {
		raw: mock(async (args: string[]) => {
			// Handle rev-parse --verify --quiet <ref>^{commit}
			if (args[0] === "rev-parse" && args[1] === "--verify") {
				const ref = args[3]?.replace("^{commit}", "") ?? "";
				if (existingRefs.has(ref)) return "";
				throw new Error(`fatal: Needed a single revision`);
			}
			// Handle symbolic-ref refs/remotes/origin/HEAD --short
			if (
				args[0] === "symbolic-ref" &&
				args[1] === "refs/remotes/origin/HEAD"
			) {
				if (existingRefs.has("__symbolic_ref__")) {
					return existingRefs.has("__default_master__")
						? "origin/master"
						: "origin/main";
				}
				throw new Error(
					"fatal: ref refs/remotes/origin/HEAD is not a symbolic ref",
				);
			}
			throw new Error(`Unexpected raw args: ${args.join(" ")}`);
		}),
	} as never;
}

describe("resolveStartPoint", () => {
	test("prefers origin/<branch> when it exists", async () => {
		const git = createMockGit(new Set(["origin/main", "main"]));
		const result = await resolveStartPoint(git, "main");

		expect(result.ref).toBe("origin/main");
		expect(result.resolvedFrom).toContain("remote-tracking");
	});

	test("falls back to local branch when origin/<branch> missing", async () => {
		const git = createMockGit(new Set(["main"]));
		const result = await resolveStartPoint(git, "main");

		expect(result.ref).toBe("main");
		expect(result.resolvedFrom).toContain("local");
	});

	test("falls back to HEAD when neither exists", async () => {
		const git = createMockGit(new Set());
		const result = await resolveStartPoint(git, "main");

		expect(result.ref).toBe("HEAD");
		expect(result.resolvedFrom).toContain("fallback");
		expect(result.resolvedFrom).toContain('"main" not found');
	});

	test("works with explicit branch name", async () => {
		const git = createMockGit(new Set(["origin/develop", "develop"]));
		const result = await resolveStartPoint(git, "develop");

		expect(result.ref).toBe("origin/develop");
		expect(result.resolvedFrom).toContain("origin/develop");
	});

	test("resolves default branch via symbolic-ref when baseBranch not provided", async () => {
		const git = createMockGit(
			new Set([
				"__symbolic_ref__",
				"__default_master__",
				"origin/master",
				"master",
			]),
		);
		const result = await resolveStartPoint(git, undefined);

		expect(result.ref).toBe("origin/master");
		expect(result.resolvedFrom).toContain("remote-tracking");
	});

	test("defaults to 'main' when symbolic-ref fails and baseBranch not provided", async () => {
		const git = createMockGit(new Set(["origin/main"]));
		const result = await resolveStartPoint(git, undefined);

		expect(result.ref).toBe("origin/main");
		expect(result.resolvedFrom).toContain("remote-tracking");
	});

	test("falls back to HEAD when symbolic-ref fails and no default branch exists", async () => {
		const git = createMockGit(new Set());
		const result = await resolveStartPoint(git, undefined);

		expect(result.ref).toBe("HEAD");
		expect(result.resolvedFrom).toContain("fallback");
		expect(result.resolvedFrom).toContain('"main" not found');
	});

	test("handles empty/whitespace baseBranch as undefined", async () => {
		const git = createMockGit(new Set(["origin/main"]));
		const result = await resolveStartPoint(git, "  ");

		expect(result.ref).toBe("origin/main");
	});
});
