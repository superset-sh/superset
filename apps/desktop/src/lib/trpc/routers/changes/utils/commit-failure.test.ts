import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { rethrowCommitFailure, toBoundedCommitFailure } from "./commit-failure";

// Synthesized in the shape simple-git surfaces: a rejected commit's message is
// the hook program's own stdout/stderr, with nothing of git's in it.
const HOOK_REJECTION = [
	"[STARTED] Running tasks for staged files...",
	"[COMPLETED] lint",
	"FAIL  src/example/thing.test.ts",
	"  ● renders the row",
	"    Expected: 1",
	"    Received: 0",
	"error Command failed with exit code 1.",
].join("\n");

// git's own die() text, which keeps reporting.
const INDEX_LOCK_FATAL =
	"fatal: Unable to create '/repo/.git/index.lock': File exists.\n";

function capture(error: unknown, exitCode: number | undefined) {
	try {
		rethrowCommitFailure(error, exitCode);
		return null;
	} catch (thrown) {
		return thrown as Error;
	}
}

function causeKind(thrown: unknown): string | undefined {
	return ((thrown as TRPCError | null)?.cause as { kind?: string } | undefined)
		?.kind;
}

describe("rethrowCommitFailure", () => {
	test("classifies a hook-rejected commit as a typed non-500", () => {
		const thrown = capture(new Error(HOOK_REJECTION), 1);
		expect(thrown).toBeInstanceOf(TRPCError);
		expect((thrown as TRPCError).code).toBe("PRECONDITION_FAILED");
		expect(causeKind(thrown)).toBe("COMMIT_DECLINED");
	});

	test("keeps the whole hook output for the user on the declined path", () => {
		const thrown = capture(new Error(HOOK_REJECTION), 1);
		expect(thrown?.message).toBe(HOOK_REJECTION);
	});

	test("still reports a genuine git failure", () => {
		const thrown = capture(new Error(INDEX_LOCK_FATAL), 128);
		expect(thrown).not.toBeInstanceOf(TRPCError);
		expect(thrown?.message).toContain("Unable to create");
	});

	test("classifies environmental failures before wrapping", () => {
		const thrown = capture(
			new Error(
				"fatal: not a git repository (or any of the parent directories)",
			),
			128,
		);
		expect((thrown as TRPCError).code).toBe("BAD_REQUEST");
		expect(causeKind(thrown)).toBe("NOT_GIT_REPO");
	});

	test("passes existing TRPCErrors through untouched", () => {
		const original = new TRPCError({ code: "BAD_REQUEST", message: "nope" });
		expect(capture(original, 1)).toBe(original);
	});

	test("bounds a large reported failure", () => {
		const huge = new Error(`${INDEX_LOCK_FATAL}${"x".repeat(60_000)}`);
		const thrown = capture(huge, 128);
		expect(thrown?.message.length).toBeLessThan(300);
		expect(thrown?.message).toContain("truncated");
	});
});

describe("toBoundedCommitFailure", () => {
	test("truncates unbounded subprocess output", () => {
		const bounded = toBoundedCommitFailure(
			new Error(`${HOOK_REJECTION}\n${"noise ".repeat(20_000)}`),
		);
		expect(bounded.message.length).toBeLessThan(300);
		expect(bounded.message.startsWith("git commit failed: ")).toBe(true);
	});

	test("drops line breaks so no stack frames survive in the capture", () => {
		const bounded = toBoundedCommitFailure(
			new Error("boom\n    at Object.<anonymous> (/repo/src/thing.js:1:1)"),
		);
		expect(bounded.message).not.toContain("\n");
	});

	test("frames short failures without a truncation note", () => {
		const bounded = toBoundedCommitFailure(new Error(INDEX_LOCK_FATAL));
		expect(bounded.message).toBe(
			"git commit failed: fatal: Unable to create '/repo/.git/index.lock': File exists.",
		);
	});

	test("handles non-Error throws", () => {
		expect(toBoundedCommitFailure("plain string").message).toBe(
			"git commit failed: plain string",
		);
	});
});
