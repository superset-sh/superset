import { create } from "zustand";
import type { PromptInputAttachmentItem } from "@/components/ai-elements/prompt-input";

/** What a surface had typed and attached when you last left it. */
export interface ComposerDraft {
	text: string;
	attachments: PromptInputAttachmentItem[];
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
}

/** Stable identity, so a surface with no draft yet does not re-render on every
 *  unrelated key's change. */
export const EMPTY_DRAFT: ComposerDraft = { attachments: [], text: "" };

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
			})),
		),
	removeAttachment: (key, id) =>
		set((state) =>
			update(state, key, (draft) => ({
				...draft,
				attachments: draft.attachments.filter((item) => item.id !== id),
			})),
		),
	clearDraft: (key) =>
		set((state) => {
			const { [key]: _removed, ...rest } = state.draftsByKey;
			return { draftsByKey: rest };
		}),
}));

/** The home screen's surface. Workspaces key by their own id. */
export const HOME_DRAFT_KEY = "home";

export const workspaceDraftKey = (workspaceId: string) =>
	`workspace:${workspaceId}`;
