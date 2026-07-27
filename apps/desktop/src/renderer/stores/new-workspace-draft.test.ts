import { afterEach, describe, expect, it } from "bun:test";
import { useNewWorkspaceDraftStore } from "./new-workspace-draft";

const store = useNewWorkspaceDraftStore;

describe("new workspace draft store", () => {
	afterEach(() => {
		store.getState().resetDraft();
	});

	it("discards a seeded prompt that was never edited", () => {
		store.getState().seedPrompt("configure setup scripts...");
		expect(store.getState().prompt).toBe("configure setup scripts...");
		expect(store.getState().promptSeeded).toBe(true);

		store.getState().discardSeededPrompt();

		expect(store.getState().prompt).toBe("");
		expect(store.getState().promptSeeded).toBe(false);
	});

	it("keeps a seeded prompt the user edited", () => {
		store.getState().seedPrompt("configure setup scripts...");
		store
			.getState()
			.updateDraft({ prompt: "configure setup scripts... plus my notes" });

		store.getState().discardSeededPrompt();

		expect(store.getState().prompt).toBe(
			"configure setup scripts... plus my notes",
		);
	});

	it("keeps a user-typed prompt (never seeded)", () => {
		store.getState().updateDraft({ prompt: "my own draft" });

		store.getState().discardSeededPrompt();

		expect(store.getState().prompt).toBe("my own draft");
	});

	it("stays seeded through non-prompt draft updates", () => {
		store.getState().seedPrompt("configure setup scripts...");
		store.getState().updateDraft({ selectedProjectId: "project-1" });
		// Editor hydration re-emitting identical content is not an edit.
		store.getState().updateDraft({ prompt: "configure setup scripts..." });

		expect(store.getState().promptSeeded).toBe(true);

		store.getState().discardSeededPrompt();

		expect(store.getState().prompt).toBe("");
		// User-selected fields survive; only the seeded prompt is discarded.
		expect(store.getState().selectedProjectId).toBe("project-1");
	});

	it("resets the seeded flag and bumps resetKey on seed", () => {
		const before = store.getState().resetKey;
		store.getState().updateDraft({ workspaceName: "stale", prompt: "old" });

		store.getState().seedPrompt("seeded");

		expect(store.getState().resetKey).toBe(before + 1);
		expect(store.getState().workspaceName).toBe("");
		expect(store.getState().prompt).toBe("seeded");
	});

	it("clears the seeded flag on resetDraft", () => {
		store.getState().seedPrompt("seeded");
		store.getState().resetDraft();

		expect(store.getState().promptSeeded).toBe(false);
		expect(store.getState().prompt).toBe("");
	});
});
