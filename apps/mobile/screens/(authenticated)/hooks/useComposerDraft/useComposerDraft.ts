import { useLingui } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import {
	MAX_ATTACHMENT_BYTES,
	MAX_ATTACHMENTS,
} from "@superset/shared/attachment-limits";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useCallback } from "react";
import { Alert } from "react-native";
import {
	createAttachmentId,
	documentAssetToAttachment,
	imageAssetToAttachment,
	type PromptInputAttachmentInput,
} from "@/components/ai-elements/prompt-input";
import {
	cancelAttachmentUpload,
	startAttachmentUploads,
} from "@/lib/attachments/upload";
import { posthog } from "@/lib/posthog";
import {
	EMPTY_DRAFT,
	HOME_DRAFT_KEY,
	useComposerDraftsStore,
} from "@/screens/(authenticated)/stores/composerDraftsStore";

export type AttachmentSource = "camera" | "photos" | "files" | "paste";

const composerName = (key: string) =>
	key === HOME_DRAFT_KEY ? "home" : "workspace";

/**
 * The picker's own figure where it gave one, the file on disk otherwise —
 * the camera, the native sheet and paste all hand over a uri and nothing
 * else. `size` is 0 for anything unreadable, which passes here and is caught
 * at upload, where the failure can name the file.
 */
function sizeOf(item: PromptInputAttachmentInput): number {
	return item.size ?? new File(item.uri).size;
}

/**
 * One composer surface's draft — its text and its attachment tray.
 *
 * Both live in React Native. The tray has to: the pickers, the attachments
 * sheet, paste and the terminal's uploader all mutate it, and the composer only
 * renders a mirror. Keeping the text beside it rather than in Swift is what
 * makes a draft one thing that can be saved and restored, instead of two halves
 * in two languages with two lifetimes.
 *
 * The key scopes it. Surfaces that pass different keys cannot see each other's
 * drafts, which is the point: before this there was a single tray for the whole
 * app, so an image attached on the home screen was sitting in every workspace.
 *
 * Note what is **not** subscribed: the text. A caller only reads it once, to
 * hand it back at mount, and the composer owns it from then on. Subscribing
 * would re-render the whole surface on every keystroke — a cost the composer
 * does not pay today, since its text never crosses into React Native at all.
 * `readText` is the one-shot read instead.
 */
export function useComposerDraft(key: string) {
	const { t } = useLingui();
	const attachments = useComposerDraftsStore(
		(state) => (state.draftsByKey[key] ?? EMPTY_DRAFT).attachments,
	);
	const setTextForKey = useComposerDraftsStore((state) => state.setText);
	const addForKey = useComposerDraftsStore((state) => state.addAttachments);
	const removeForKey = useComposerDraftsStore(
		(state) => state.removeAttachment,
	);
	const clearForKey = useComposerDraftsStore((state) => state.clearDraft);

	const setText = useCallback(
		(text: string) => setTextForKey(key, text),
		[key, setTextForKey],
	);

	/** The saved text, read once — see the note above about not subscribing. */
	const readText = useCallback(
		() => useComposerDraftsStore.getState().draftsByKey[key]?.text ?? "",
		[key],
	);

	// Enforced here rather than at send: this is the one funnel every source
	// goes through (both pickers, the camera, the native sheet, paste), and a
	// file the composer cannot send is better refused while the user is still
	// looking at the picker than after they have written a message around it.
	const add = useCallback(
		(items: PromptInputAttachmentInput[], source: AttachmentSource) => {
			if (items.length === 0) return;

			const sized = items.filter(
				(item) => sizeOf(item) <= MAX_ATTACHMENT_BYTES,
			);
			// From the store, not the rendered list: two adds in one tick — a
			// paste landing while a picker returns — would both measure the
			// same stale count and together overshoot the cap, which the
			// host then refuses once the uploads have already run.
			const held =
				useComposerDraftsStore.getState().draftsByKey[key]?.attachments
					.length ?? 0;
			const capacity = Math.max(0, MAX_ATTACHMENTS - held);
			const accepted = sized.slice(0, capacity);

			// One reason, size first: it names a specific file the user chose,
			// where the count is about the tray as a whole. Two alerts in a row
			// would only bury the more useful one.
			if (sized.length < items.length) {
				Alert.alert(
					t({
						message: "Attachment is too large",
					}),
					t({
						message: `Each attachment is at most ${formatNumber(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB.`,
					}),
				);
			} else if (accepted.length < sized.length) {
				Alert.alert(
					t({
						message: `You can attach up to ${MAX_ATTACHMENTS} files`,
					}),
				);
			}
			if (accepted.length === 0) return;

			const withIds = accepted.map((item) => ({
				...item,
				id: createAttachmentId(),
			}));
			addForKey(key, withIds);
			// Started here rather than at send: the upload then runs while the
			// message is still being written, which on a large file is the
			// whole difference in how the send feels.
			startAttachmentUploads(key, withIds);
			posthog.capture("attachment_added", {
				source,
				count: accepted.length,
				composer: composerName(key),
			});
		},
		[key, addForKey, t],
	);

	const remove = useCallback(
		(id: string) => {
			cancelAttachmentUpload(id);
			removeForKey(key, id);
			posthog.capture("attachment_removed", { composer: composerName(key) });
		},
		[key, removeForKey],
	);

	// Whatever is still in flight belongs to a draft that no longer exists.
	// After a send they have all finished and there is nothing to abort.
	const clear = useCallback(() => {
		for (const item of useComposerDraftsStore.getState().draftsByKey[key]
			?.attachments ?? []) {
			cancelAttachmentUpload(item.id);
		}
		clearForKey(key);
	}, [key, clearForKey]);

	const openImagePicker = useCallback(async () => {
		try {
			const result = await ImagePicker.launchImageLibraryAsync({
				allowsMultipleSelection: true,
				mediaTypes: ["images"],
				// Automatic, stacked over the attachments sheet, sometimes hides
				// the picker's bottom bar.
				presentationStyle:
					ImagePicker.UIImagePickerPresentationStyle.PAGE_SHEET,
				quality: 0.8,
			});
			if (result.canceled) return false;
			const items = await Promise.all(
				result.assets.map(imageAssetToAttachment),
			);
			add(
				items.filter((item) => item !== null),
				"photos",
			);
			return true;
		} catch {
			Alert.alert(
				t({
					message: "Could not open Photos",
				}),
			);
			return false;
		}
	}, [add, t]);

	const openFilePicker = useCallback(async () => {
		try {
			const result = await DocumentPicker.getDocumentAsync({ multiple: true });
			if (result.canceled) return false;
			add(
				await Promise.all(result.assets.map(documentAssetToAttachment)),
				"files",
			);
			return true;
		} catch {
			Alert.alert(
				t({
					message: "Could not open Files",
				}),
			);
			return false;
		}
	}, [add, t]);

	return {
		add,
		attachments,
		clear,
		openFilePicker,
		openImagePicker,
		readText,
		remove,
		setText,
	};
}

export type ComposerDraftControls = ReturnType<typeof useComposerDraft>;
