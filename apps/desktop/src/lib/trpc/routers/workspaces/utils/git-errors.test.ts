import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import {
	classifyEnvironmentalGitError,
	GitEnvironmentError,
	NotGitRepoError,
	rethrowEnvironmentalGitError,
} from "./git-errors";

// simple-git's GitError carries git's stderr verbatim as the message.
const CWD_PERMISSION =
	"fatal: Unable to read current working directory: Operation not permitted\n";
const CWD_GONE =
	"fatal: Unable to read current working directory: No such file or directory\n";
const NOT_A_REPO =
	"fatal: not a git repository (or any of the parent directories): .git\n";

describe("classifyEnvironmentalGitError", () => {
	test("maps cwd-unreadable variants to GitEnvironmentError", () => {
		for (const message of [CWD_PERMISSION, CWD_GONE]) {
			const classified = classifyEnvironmentalGitError(new Error(message));
			expect(classified).toBeInstanceOf(GitEnvironmentError);
			expect(classified?.message).toBe(message);
		}
	});

	test("maps not-a-repository to NotGitRepoError", () => {
		const classified = classifyEnvironmentalGitError(new Error(NOT_A_REPO));
		expect(classified).toBeInstanceOf(NotGitRepoError);
		expect(classified?.message).toBe(NOT_A_REPO);
	});

	test("returns null for genuine unexpected failures", () => {
		expect(
			classifyEnvironmentalGitError(new Error("fatal: bad revision 'HEAD~1'")),
		).toBeNull();
		expect(classifyEnvironmentalGitError("string error")).toBeNull();
	});
});

describe("rethrowEnvironmentalGitError", () => {
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

	test("throws PRECONDITION_FAILED for cwd-unreadable messages", () => {
		const thrown = capture(new Error(CWD_PERMISSION));
		expect(thrown?.code).toBe("PRECONDITION_FAILED");
		expect(causeKind(thrown)).toBe("GIT_ENVIRONMENT");
		expect(thrown?.message).toBe(CWD_PERMISSION);
	});

	test("throws BAD_REQUEST for not-a-repository messages", () => {
		const thrown = capture(new Error(NOT_A_REPO));
		expect(thrown?.code).toBe("BAD_REQUEST");
		expect(causeKind(thrown)).toBe("NOT_GIT_REPO");
	});

	test("matches worker-serialized domain errors by name", () => {
		const crossedBoundary = new Error("Failed to get git status: timeout");
		crossedBoundary.name = "GitEnvironmentError";
		expect(capture(crossedBoundary)?.code).toBe("PRECONDITION_FAILED");
	});

	test("no-ops for TRPCErrors and genuine failures", () => {
		expect(
			capture(new TRPCError({ code: "BAD_REQUEST", message: NOT_A_REPO })),
		).toBeNull();
		expect(capture(new Error("fatal: bad revision 'HEAD~1'"))).toBeNull();
	});
});
