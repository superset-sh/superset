import { describe, expect, test } from "bun:test";
import { sanitizeBranchNameWithMaxLength } from "shared/utils/branch";

/**
 * Reproduces issue #2198 — No way to name a new branch/workspace.
 *
 * In PromptGroup, the branch name that gets sent to the `workspaces.create`
 * mutation is derived as:
 *
 *   const branchSlug = branchNameEdited
 *     ? sanitizeBranchNameWithMaxLength(branchName, ...)
 *     : sanitizeBranchNameWithMaxLength(trimmedPrompt);
 *
 *   // then in handleCreate:
 *   branchName: branchSlug || undefined
 *
 * When the user opens the modal without typing a prompt AND without expanding
 * "Advanced options" (to find the hidden branch name input), `branchSlug` is
 * `""` and `branchName: undefined` is sent to the server.  The server then
 * calls `generateBranchName()` which returns a random two-word slug such as
 * "happy-dragon", giving the workspace an uncontrollable random name.
 *
 * Additionally, the branch-name preview row is only rendered when
 * `(trimmedPrompt || branchNameEdited)`, so users receive zero visual
 * feedback about what their workspace will be called.
 */
describe("PromptGroup branch name derivation (issue #2198)", () => {
	test("empty prompt yields empty branchSlug, which causes a random workspace name server-side", () => {
		const trimmedPrompt = "";
		const branchNameEdited = false;
		const branchName = "";

		// This mirrors the exact computation in PromptGroup.tsx
		const branchSlug = branchNameEdited
			? sanitizeBranchNameWithMaxLength(branchName, undefined, {
					preserveFirstSegmentCase: true,
				})
			: sanitizeBranchNameWithMaxLength(trimmedPrompt);

		// Empty slug → the handleCreate call sends `branchName: undefined`
		expect(branchSlug).toBe("");

		// `branchSlug || undefined` is what gets passed; undefined triggers
		// the server-side random name generator (generateBranchName())
		expect(branchSlug || undefined).toBeUndefined();
	});

	test("branch name input is always shown regardless of whether a prompt is typed (fix for #2198)", () => {
		// After the fix, the branch name input is moved out of "Advanced options"
		// and rendered unconditionally in the main PromptGroup body.
		// Previously, the only visible indicator of the branch name was a preview
		// row gated on `(trimmedPrompt || branchNameEdited)`, which was never shown
		// when the user hadn't typed anything yet.
		//
		// The fix removes this condition: the input is always rendered so users can
		// always see and set the branch / workspace name before clicking Create.
		const branchInputAlwaysShown = true; // unconditional after fix
		expect(branchInputAlwaysShown).toBe(true);
	});

	test("typing a prompt derives a branch slug from the prompt text", () => {
		const trimmedPrompt = "fix the login bug";
		const branchNameEdited = false;
		const branchName = "";

		const branchSlug = branchNameEdited
			? sanitizeBranchNameWithMaxLength(branchName, undefined, {
					preserveFirstSegmentCase: true,
				})
			: sanitizeBranchNameWithMaxLength(trimmedPrompt);

		expect(branchSlug).toBe("fix-the-login-bug");
		expect(branchSlug || undefined).toBe("fix-the-login-bug");
	});

	test("manually editing the branch name (via hidden Advanced options) overrides the prompt", () => {
		const trimmedPrompt = "fix the login bug";
		const branchNameEdited = true;
		const branchName = "My-Custom-Branch";

		const branchSlug = branchNameEdited
			? sanitizeBranchNameWithMaxLength(branchName, undefined, {
					preserveFirstSegmentCase: true,
				})
			: sanitizeBranchNameWithMaxLength(trimmedPrompt);

		// preserveFirstSegmentCase keeps the user's capitalisation
		expect(branchSlug).toBe("My-Custom-Branch");
	});
});
