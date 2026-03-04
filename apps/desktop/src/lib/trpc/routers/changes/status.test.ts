import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	detectAndRecoverUnbornHead,
	type GitRawExecutor,
} from "./utils/unborn-head";

function createGitWithRaw(
	raw: (args: string[]) => Promise<string>,
): GitRawExecutor {
	return { raw };
}

describe("detectAndRecoverUnbornHead", () => {
	let originalWarn: typeof console.warn;
	let originalError: typeof console.error;

	beforeEach(() => {
		originalWarn = console.warn;
		originalError = console.error;
		console.warn = () => {};
		console.error = () => {};
	});

	afterEach(() => {
		console.warn = originalWarn;
		console.error = originalError;
	});

	test("returns false when HEAD is valid", async () => {
		const calls: string[][] = [];
		const git = createGitWithRaw(async (args) => {
			calls.push(args);
			return "abc123";
		});

		const recovered = await detectAndRecoverUnbornHead(git, "/tmp/wt", "main");

		expect(recovered).toBe(false);
		expect(calls).toEqual([["rev-parse", "HEAD"]]);
	});

	test("returns true when unborn HEAD is recovered via hard reset", async () => {
		const calls: string[][] = [];
		const git = createGitWithRaw(async (args) => {
			calls.push(args);
			if (args[0] === "rev-parse") {
				throw new Error("fatal: ambiguous argument 'HEAD'");
			}
			return "";
		});

		const recovered = await detectAndRecoverUnbornHead(git, "/tmp/wt", "main");

		expect(recovered).toBe(true);
		expect(calls).toEqual([
			["rev-parse", "HEAD"],
			["reset", "--hard", "origin/main"],
		]);
	});

	test("returns false when HEAD validation fails for non-unborn errors", async () => {
		const calls: string[][] = [];
		const git = createGitWithRaw(async (args) => {
			calls.push(args);
			throw new Error("fatal: not a git repository");
		});

		const recovered = await detectAndRecoverUnbornHead(git, "/tmp/wt", "main");

		expect(recovered).toBe(false);
		expect(calls).toEqual([["rev-parse", "HEAD"]]);
	});

	test("returns false when hard-reset recovery fails", async () => {
		const calls: string[][] = [];
		const git = createGitWithRaw(async (args) => {
			calls.push(args);
			if (args[0] === "rev-parse") {
				throw new Error("fatal: ambiguous argument 'HEAD'");
			}
			throw new Error("git failed");
		});

		const recovered = await detectAndRecoverUnbornHead(git, "/tmp/wt", "main");

		expect(recovered).toBe(false);
		expect(calls).toEqual([
			["rev-parse", "HEAD"],
			["reset", "--hard", "origin/main"],
		]);
	});
});
