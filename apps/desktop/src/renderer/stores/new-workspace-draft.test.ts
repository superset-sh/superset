import { beforeEach, describe, expect, test } from "bun:test";
import { useNewWorkspaceDraftStore } from "./new-workspace-draft";

const draft = () => useNewWorkspaceDraftStore.getState();

describe("useNewWorkspaceDraftStore — setup-card seeded prompt", () => {
	beforeEach(() => {
		draft().resetDraft();
	});

	test("a fresh draft is not flagged as seeded from the setup card", () => {
		expect(draft().prompt).toBe("");
		expect(draft().promptSeededFromSetupCard).toBe(false);
	});

	test("seedSetupPrompt stores the prompt and marks it ephemeral", () => {
		draft().seedSetupPrompt("## Goal\nwrite config");

		expect(draft().prompt).toBe("## Goal\nwrite config");
		expect(draft().promptSeededFromSetupCard).toBe(true);
	});

	test("seedSetupPrompt bumps resetKey so the editor remounts with the seed", () => {
		const before = draft().resetKey;

		draft().seedSetupPrompt("seed");

		expect(draft().resetKey).toBe(before + 1);
	});

	test("seedSetupPrompt clears any leftover draft fields first", () => {
		draft().updateDraft({ workspaceName: "leftover", selectedProjectId: "p1" });

		draft().seedSetupPrompt("seed");

		expect(draft().workspaceName).toBe("");
		expect(draft().selectedProjectId).toBeNull();
	});

	test("editing the prompt clears the ephemeral seed flag (now user-authored)", () => {
		draft().seedSetupPrompt("seed");

		draft().updateDraft({ prompt: "seed + my own edits" });

		expect(draft().promptSeededFromSetupCard).toBe(false);
	});

	test("updating a non-prompt field keeps the seed flag intact", () => {
		draft().seedSetupPrompt("seed");

		draft().updateDraft({ selectedProjectId: "p1" });

		expect(draft().promptSeededFromSetupCard).toBe(true);
	});

	test("resetDraft clears both the seeded prompt and its flag", () => {
		draft().seedSetupPrompt("seed");

		draft().resetDraft();

		expect(draft().prompt).toBe("");
		expect(draft().promptSeededFromSetupCard).toBe(false);
	});
});
