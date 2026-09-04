import { afterEach, describe, expect, test } from "bun:test";
import {
	resetNewWorkspaceDraftOnRouteLeave,
	useNewWorkspaceDraftStore,
} from "./new-workspace-draft";
import { useNewWorkspaceModalStore } from "./new-workspace-modal";

const SETUP_SCRIPT_PROMPT = "Write a setup script for this project";

describe("new workspace modal store (#5372)", () => {
	afterEach(() => {
		// Leave both stores in a clean state for the next test.
		useNewWorkspaceModalStore.getState().closeModal();
		useNewWorkspaceDraftStore.getState().resetDraft();
	});

	test("dismissing the modal clears a seeded draft prompt", () => {
		// Mirrors V2SetupScriptCard.handleConfigure: seed the draft with the
		// setup-script prompt, then open the modal.
		const draftStore = useNewWorkspaceDraftStore.getState();
		draftStore.resetDraft();
		draftStore.updateDraft({ prompt: SETUP_SCRIPT_PROMPT });
		useNewWorkspaceModalStore.getState().openModal("project-1");

		expect(useNewWorkspaceDraftStore.getState().prompt).toBe(
			SETUP_SCRIPT_PROMPT,
		);

		// Esc / outside click → closeModal (the dismiss path).
		useNewWorkspaceModalStore.getState().closeModal();

		expect(useNewWorkspaceDraftStore.getState().prompt).toBe("");
		expect(useNewWorkspaceModalStore.getState().isOpen).toBeFalse();
	});

	test("a fresh open after dismiss shows no leftover prompt", () => {
		const draftStore = useNewWorkspaceDraftStore.getState();
		draftStore.updateDraft({ prompt: SETUP_SCRIPT_PROMPT });
		useNewWorkspaceModalStore.getState().openModal("project-1");
		useNewWorkspaceModalStore.getState().closeModal();

		// The next "New Workspace" click (no seed) must start empty.
		useNewWorkspaceModalStore.getState().openModal("project-2");
		expect(useNewWorkspaceDraftStore.getState().prompt).toBe("");
	});

	test("full-page handoff preserves the seeded draft", () => {
		// DashboardNewWorkspaceModal test arm: closes the store modal with
		// { resetDraft: false } before navigating to /new-workspace, where
		// the destination screen consumes the seeded prompt.
		const draftStore = useNewWorkspaceDraftStore.getState();
		draftStore.resetDraft();
		draftStore.updateDraft({ prompt: SETUP_SCRIPT_PROMPT });
		useNewWorkspaceModalStore.getState().openModal("project-1");

		useNewWorkspaceModalStore.getState().closeModal({ resetDraft: false });

		expect(useNewWorkspaceDraftStore.getState().prompt).toBe(
			SETUP_SCRIPT_PROMPT,
		);
		expect(useNewWorkspaceModalStore.getState().isOpen).toBeFalse();
	});

	test("leaving the full-page flow clears the preserved handoff draft", () => {
		const draftStore = useNewWorkspaceDraftStore.getState();
		draftStore.updateDraft({ prompt: SETUP_SCRIPT_PROMPT });
		useNewWorkspaceModalStore.getState().openModal("project-1");
		useNewWorkspaceModalStore.getState().closeModal({ resetDraft: false });

		resetNewWorkspaceDraftOnRouteLeave();

		expect(useNewWorkspaceDraftStore.getState().prompt).toBe("");
		useNewWorkspaceModalStore.getState().openModal("project-2");
		expect(useNewWorkspaceDraftStore.getState().prompt).toBe("");
	});
});
