import { describe, expect, test } from "bun:test";
import { decideNaming } from "./workspace-naming-job";

const names = { title: "Fix login", branchName: "fix-login" };
const base = {
	names,
	canRenameBranch: true,
	attempt: 1,
	prompt: "Fix the login bug.",
	hasAgent: true,
	hasAgentReply: false,
};

describe("decideNaming", () => {
	test("applies title and branch when names came back and the branch is still automatic", () => {
		expect(decideNaming(base)).toEqual({
			title: "Fix login",
			branchName: "fix-login",
			pending: false,
			gaveUp: false,
		});
	});

	test("keeps the branch when it was pushed, switched or the probe said no", () => {
		expect(
			decideNaming({ ...base, canRenameBranch: false }).branchName,
		).toBeNull();
	});

	test("a vague first pass applies the guess, keeps the row pending and holds the branch", () => {
		expect(decideNaming({ ...base, names: { ...names, vague: true } })).toEqual(
			{
				title: "Fix login",
				branchName: null,
				pending: true,
				gaveUp: false,
			},
		);
		expect(
			decideNaming({
				...base,
				names: { ...names, vague: true },
				hasAgentReply: true,
			}).pending,
		).toBe(false);
	});

	test("a failed first attempt falls back to the prompt title and stays pending", () => {
		expect(decideNaming({ ...base, names: null })).toEqual({
			title: "Fix the login bug",
			branchName: null,
			pending: true,
			gaveUp: false,
		});
		expect(decideNaming({ ...base, names: null, attempt: 2 }).title).toBeNull();
	});

	test("a failed branch probe counts as a failed attempt", () => {
		expect(decideNaming({ ...base, canRenameBranch: null }).pending).toBe(true);
	});

	test("gives up after the last attempt, and at once without an agent", () => {
		expect(decideNaming({ ...base, names: null, attempt: 3 })).toMatchObject({
			pending: false,
			gaveUp: true,
		});
		expect(
			decideNaming({ ...base, names: null, hasAgent: false }),
		).toMatchObject({
			pending: false,
			gaveUp: true,
		});
	});
});
