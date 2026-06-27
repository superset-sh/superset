import { beforeEach, describe, expect, test } from "bun:test";
import { useNewWorkspaceDraftStore } from "./new-workspace-draft";
import { useNewWorkspaceModalStore } from "./new-workspace-modal";

const draft = () => useNewWorkspaceDraftStore.getState();
const modal = () => useNewWorkspaceModalStore.getState();

describe("closeModal — setup-card seed cleanup", () => {
	beforeEach(() => {
		draft().resetDraft();
		modal().closeModal();
	});

	test("closing the modal drops an unedited setup-card seed", () => {
		draft().seedSetupPrompt("seed");
		modal().openModal("p1");

		modal().closeModal();

		expect(draft().prompt).toBe("");
		expect(draft().promptSeededFromSetupCard).toBe(false);
	});

	test("closing the modal keeps a prompt the user has edited", () => {
		draft().seedSetupPrompt("seed");
		draft().updateDraft({ prompt: "my edits" });
		modal().openModal("p1");

		modal().closeModal();

		expect(draft().prompt).toBe("my edits");
	});

	test("closing the modal leaves a plain (unseeded) draft untouched", () => {
		draft().updateDraft({ prompt: "typed from scratch" });
		modal().openModal("p1");

		modal().closeModal();

		expect(draft().prompt).toBe("typed from scratch");
	});
});
