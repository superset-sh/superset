import { describe, expect, test } from "bun:test";
import { resolvePromptBranchName } from "./fallback-branch-name";

// Reproduction for #5825: creating a workspace from a meaningful prompt used to
// yield a branch derived from that prompt. When AI naming is unavailable the
// create flow regressed to random friendly words (e.g. "interesting-forest"),
// discarding the prompt the user already typed. This helper is the fallback the
// create procedure uses before reaching for a random name.
const PROMPT = "Let's implement some UI changes after QA";
const noPrefix = (name: string) => name;

describe("resolvePromptBranchName", () => {
	test("derives a sensible slug from the prompt", () => {
		expect(
			resolvePromptBranchName({
				prompt: PROMPT,
				existingBranches: [],
				addPrefix: noPrefix,
			}),
		).toBe("lets-implement-some-ui-changes");
	});

	test("applies the branch prefix to the derived slug", () => {
		expect(
			resolvePromptBranchName({
				prompt: PROMPT,
				existingBranches: [],
				addPrefix: (name) => `alice/${name}`,
			}),
		).toBe("alice/lets-implement-some-ui-changes");
	});

	test("deduplicates against existing branches", () => {
		expect(
			resolvePromptBranchName({
				prompt: PROMPT,
				existingBranches: ["lets-implement-some-ui-changes"],
				addPrefix: noPrefix,
			}),
		).toBe("lets-implement-some-ui-changes-1");
	});

	test("returns null when there is no prompt to derive from", () => {
		expect(
			resolvePromptBranchName({
				prompt: "   ",
				existingBranches: [],
				addPrefix: noPrefix,
			}),
		).toBeNull();
		expect(
			resolvePromptBranchName({
				prompt: undefined,
				existingBranches: [],
				addPrefix: noPrefix,
			}),
		).toBeNull();
	});

	test("returns null when the prompt has no slug-able characters", () => {
		expect(
			resolvePromptBranchName({
				prompt: "!!! ??? ...",
				existingBranches: [],
				addPrefix: noPrefix,
			}),
		).toBeNull();
	});
});
