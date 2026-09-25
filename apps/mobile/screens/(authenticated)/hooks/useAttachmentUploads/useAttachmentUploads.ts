import {
	type AttachmentUpload,
	EMPTY_DRAFT,
	useComposerDraftsStore,
} from "@/screens/(authenticated)/stores/composerDraftsStore";

/**
 * A surface's attachment upload state, keyed by attachment id.
 *
 * Deliberately separate from `useComposerDraft`: this changes on every
 * progress tick, and the attachments sheet and paste handler have no use for
 * it. Only the two composers that draw the tray subscribe here, so a transfer
 * in flight does not re-render everything else holding a draft.
 */
export function useAttachmentUploads(
	key: string,
): Record<string, AttachmentUpload> {
	return useComposerDraftsStore(
		(state) => (state.draftsByKey[key] ?? EMPTY_DRAFT).uploads,
	);
}
