import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { simpleGit } from "simple-git";
import { rethrowEnvironmentalGitError } from "./classify-git-error";

function capture(error: unknown): TRPCError | null {
	try {
		rethrowEnvironmentalGitError(error);
		return null;
	} catch (thrown) {
		return thrown as TRPCError;
	}
}

function causeKind(thrown: TRPCError | null): string | undefined {
	return (thrown?.cause as { kind?: string } | undefined)?.kind;
}

describe("rethrowEnvironmentalGitError", () => {
	test("worktree deleted mid-command → NOT_FOUND / WORKTREE_MISSING", () => {
		const thrown = capture(
			new Error(
				"fatal: Unable to read current working directory: No such file or directory\n",
			),
		);
		expect(thrown?.code).toBe("NOT_FOUND");
		expect(causeKind(thrown)).toBe("WORKTREE_MISSING");
	});

	test("bare repo or pruned worktree → NOT_FOUND / NOT_A_WORK_TREE", () => {
		const message = "fatal: this operation must be run in a work tree\n";
		const thrown = capture(new Error(message));
		expect(thrown?.code).toBe("NOT_FOUND");
		expect(causeKind(thrown)).toBe("NOT_A_WORK_TREE");
		expect(thrown?.message).toBe(message);
	});

	test("permission wall → PRECONDITION_FAILED / GIT_ENVIRONMENT", () => {
		const thrown = capture(
			new Error(
				"fatal: Unable to read current working directory: Operation not permitted\n",
			),
		);
		expect(thrown?.code).toBe("PRECONDITION_FAILED");
		expect(causeKind(thrown)).toBe("GIT_ENVIRONMENT");
	});

	test("not a repository → BAD_REQUEST / NOT_GIT_REPO", () => {
		const message =
			"fatal: not a git repository (or any of the parent directories): .git\n";
		const thrown = capture(new Error(message));
		expect(thrown?.code).toBe("BAD_REQUEST");
		expect(causeKind(thrown)).toBe("NOT_GIT_REPO");
		expect(thrown?.message).toBe(message);
	});

	test("simple-git construct error → NOT_FOUND / WORKTREE_MISSING", () => {
		const message = "Cannot use simple-git on a directory that does not exist";
		const thrown = capture(new Error(message));
		expect(thrown?.code).toBe("NOT_FOUND");
		expect(causeKind(thrown)).toBe("WORKTREE_MISSING");
		expect(thrown?.message).toBe(message);
	});

	test("simple-git construct errors arrive named Error, not GitConstructError", () => {
		// simple-git's GitError never assigns `this.name`, so the subclass name is
		// invisible at runtime — matching on it would make the branch above dead
		// code. The worker boundary drops `config` too, leaving only the message.
		let caught: unknown;
		try {
			simpleGit("/superset-classifier-probe/does/not/exist");
		} catch (error) {
			caught = error;
		}
		expect((caught as Error).name).toBe("Error");
		expect((caught as Error).message).toBe(
			"Cannot use simple-git on a directory that does not exist",
		);
	});

	test("no-ops for TRPCErrors and genuine failures", () => {
		expect(
			capture(new TRPCError({ code: "NOT_FOUND", message: "missing" })),
		).toBeNull();
		expect(capture(new Error("fatal: bad revision 'HEAD~1'"))).toBeNull();
		expect(
			capture(
				new Error(
					"fatal: Unable to create '/repo/.git/index.lock': File exists.\n",
				),
			),
		).toBeNull();
		expect(
			capture(new Error("fatal: detected dubious ownership in repository\n")),
		).toBeNull();
		expect(capture(new Error("fatal: cannot chdir to work tree\n"))).toBeNull();
		expect(capture("string error")).toBeNull();
	});

	test("does not swallow other 'does not exist' failures", () => {
		// The construct-error branch must key on simple-git's own sentence, not on
		// the phrase "does not exist" — git says that about refs, paths and remotes
		// all the time, and those are ordinary failures the caller should see.
		expect(
			capture(new Error("fatal: path 'src/app.ts' does not exist in 'HEAD'\n")),
		).toBeNull();
		expect(
			capture(new Error("error: remote origin does not exist.\n")),
		).toBeNull();
		expect(
			capture(
				new Error(
					"fatal: invalid object name 'feature/directory-that-does-not-exist'\n",
				),
			),
		).toBeNull();
	});

	test("keeps our own simple-git misconfiguration reporting as a 500", () => {
		// simple-git raises GitConstructError for more than one condition. Only the
		// missing-directory one is environmental; anything else on that path is a
		// bug in how we construct the client and must stay unclassified.
		expect(
			capture(new Error("Cannot use simple-git with an invalid configuration")),
		).toBeNull();
		expect(
			capture(new Error("Unable to find path to repository in parent tree")),
		).toBeNull();
	});
});
