import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
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

	test("no-ops for TRPCErrors and genuine failures", () => {
		expect(
			capture(new TRPCError({ code: "NOT_FOUND", message: "missing" })),
		).toBeNull();
		expect(capture(new Error("fatal: bad revision 'HEAD~1'"))).toBeNull();
		expect(capture("string error")).toBeNull();
	});
});
