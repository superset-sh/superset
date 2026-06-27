import { beforeEach, describe, expect, test } from "bun:test";
import { useNewWorkspaceDraftStore } from "./new-workspace-draft";

// Mirrors the prompt V2SetupScriptCard seeds into the draft when the user
// clicks "Configure" on the Setup scripts card.
const SEED_PROMPT = "Write setup/teardown scripts for this project.";

describe("new-workspace-draft dismiss behaviour", () => {
	beforeEach(() => {
		useNewWorkspaceDraftStore.getState().resetDraft();
	});

	// Reproduces https://github.com/.../issues/5372
	// Clicking "Configure" seeds the prompt, dismissing the modal must not leave
	// that seeded prompt behind in the persisted draft.
	test("dismissing a Configure-seeded draft clears the prompt", () => {
		const store = useNewWorkspaceDraftStore.getState();

		// handleConfigure: reset then seed the setup-script prompt.
		store.resetDraft();
		store.updateDraft({ prompt: SEED_PROMPT, seededFromConfigure: true });
		expect(useNewWorkspaceDraftStore.getState().prompt).toBe(SEED_PROMPT);

		// User dismisses the modal (Esc / click outside) without creating.
		useNewWorkspaceDraftStore.getState().dismissDraft();

		// Next "+ New Workspace" open should start from an empty composer.
		expect(useNewWorkspaceDraftStore.getState().prompt).toBe("");
		expect(useNewWorkspaceDraftStore.getState().seededFromConfigure).toBe(
			false,
		);
	});

	// A draft the user actually typed must survive a dismiss so they don't lose
	// their work when they reopen the modal.
	test("dismissing a user-typed draft preserves the prompt", () => {
		const store = useNewWorkspaceDraftStore.getState();

		store.updateDraft({ prompt: "my own prompt" });
		useNewWorkspaceDraftStore.getState().dismissDraft();

		expect(useNewWorkspaceDraftStore.getState().prompt).toBe("my own prompt");
	});
});
