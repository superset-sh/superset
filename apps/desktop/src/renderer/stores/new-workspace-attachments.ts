import { createPromptInputAttachmentsStore } from "@superset/ui/ai-elements/prompt-input";
import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";

/**
 * Module-scoped attachment state for the new-workspace draft. Keeps attached
 * files alive across navigation the same way the prompt text survives in
 * useNewWorkspaceDraftStore — the create surfaces mount and unmount, this
 * store does not.
 */
export const newWorkspaceAttachmentsStore = createPromptInputAttachmentsStore();

/**
 * Source paths for dropped/picked files, keyed by filename — attachment items
 * only keep an object URL, and Finder reveal needs the original path. Module
 * scoped so reveal keeps working for attachments restored after navigation.
 */
export const newWorkspaceAttachmentPaths = new Map<string, string>();

// A draft reset (successful create or explicit discard) clears attachments
// with it, even while no create surface is mounted.
useNewWorkspaceDraftStore.subscribe((state, prevState) => {
	if (state.resetKey !== prevState.resetKey) {
		newWorkspaceAttachmentsStore.clear();
		newWorkspaceAttachmentPaths.clear();
	}
});
