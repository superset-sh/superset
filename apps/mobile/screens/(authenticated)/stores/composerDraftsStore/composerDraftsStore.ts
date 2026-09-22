import { create } from "zustand";
import type { PromptInputAttachmentItem } from "@/components/ai-elements/prompt-input";

/**
 * One attachment's trip to cloud storage, which starts when it is attached
 * rather than when the message is sent — so the transfer overlaps composing
 * instead of holding up the send.
 */
export interface AttachmentUpload {
	/** 0–1, for the ring on the thumbnail. */
	progress: number;
	/** Set once the bytes are up. What a send hands the host. */
	fileId?: string;
	/** Set when it failed. A send retries rather than reporting it here. */
	error?: string;
}

/** What a surface had typed and attached when you last left it. */
export interface ComposerDraft {
	text: string;
	attachments: PromptInputAttachmentItem[];
	/**
	 * Keyed by attachment id. Kept beside the attachments rather than on them
	 * so a progress tick leaves the `attachments` array identity alone — it
	 * crosses into SwiftUI as a prop, and re-creating it sixty times a second
	 * would rebuild the whole tray.
	 */
	uploads: Record<string, AttachmentUpload>;
}

/**
 * Drafts per composer surface — `home`, and one per workspace.
 *
 * Deliberately **not** persisted. Attachment URIs point at files in the app's
 * cache, which the OS is free to evict between launches, so a restored draft
 * could reference images that no longer exist. Within one launch that cannot
 * happen, which is exactly the lifetime this store has.
 */
interface ComposerDraftsStore {
	draftsByKey: Record<string, ComposerDraft>;
	setText: (key: string, text: string) => void;
	addAttachments: (key: string, items: PromptInputAttachmentItem[]) => void;
	removeAttachment: (key: string, id: string) => void;
	clearDraft: (key: string) => void;
	beginUpload: (key: string, id: string) => void;
	setUploadProgress: (key: string, id: string, progress: number) => void;
	finishUpload: (key: string, id: string, fileId: string) => void;
	failUpload: (key: string, id: string, error: string) => void;
}

/** Stable identity, so a surface with no draft yet does not re-render on every
 *  unrelated key's change. */
export const EMPTY_DRAFT: ComposerDraft = {
	attachments: [],
	text: "",
	uploads: {},
};

const update = (
	state: ComposerDraftsStore,
	key: string,
	change: (draft: ComposerDraft) => ComposerDraft,
) => ({
	draftsByKey: {
		...state.draftsByKey,
		[key]: change(state.draftsByKey[key] ?? EMPTY_DRAFT),
	},
});

export const useComposerDraftsStore = create<ComposerDraftsStore>()((set) => ({
	draftsByKey: {},
	setText: (key, text) =>
		set((state) => update(state, key, (draft) => ({ ...draft, text }))),
	addAttachments: (key, items) =>
		set((state) =>
			update(state, key, (draft) => ({
				...draft,
				attachments: [...draft.attachments, ...items],
				uploads: {
					...draft.uploads,
					...Object.fromEntries(
						items.map((item) => [item.id, { progress: 0 }]),
					),
				},
			})),
		),
	removeAttachment: (key, id) =>
		set((state) =>
			update(state, key, (draft) => {
				const { [id]: _dropped, ...uploads } = draft.uploads;
				return {
					...draft,
					attachments: draft.attachments.filter((item) => item.id !== id),
					uploads,
				};
			}),
		),
	clearDraft: (key) =>
		set((state) => {
			const { [key]: _removed, ...rest } = state.draftsByKey;
			return { draftsByKey: rest };
		}),
	beginUpload: (key, id) =>
		set((state) =>
			patchUpload(state, key, id, {
				progress: 0,
				fileId: undefined,
				error: undefined,
			}),
		),
	setUploadProgress: (key, id, progress) =>
		set((state) => patchUpload(state, key, id, { progress })),
	finishUpload: (key, id, fileId) =>
		set((state) =>
			patchUpload(state, key, id, { progress: 1, fileId, error: undefined }),
		),
	failUpload: (key, id, error) =>
		set((state) => patchUpload(state, key, id, { error })),
}));

/**
 * Writes one attachment's upload state, ignoring an attachment the draft no
 * longer holds — an upload that lands after its attachment was removed, or
 * after the draft was sent, must not resurrect either.
 */
const patchUpload = (
	state: ComposerDraftsStore,
	key: string,
	id: string,
	change: Partial<AttachmentUpload>,
) => {
	const existing = state.draftsByKey[key]?.uploads[id];
	if (!existing) return state;
	return update(state, key, (draft) => ({
		...draft,
		uploads: { ...draft.uploads, [id]: { ...existing, ...change } },
	}));
};

/** The home screen's surface. Workspaces key by their own id. */
export const HOME_DRAFT_KEY = "home";

export const workspaceDraftKey = (workspaceId: string) =>
	`workspace:${workspaceId}`;
