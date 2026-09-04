import { useLingui } from "@lingui/react/macro";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useCallback } from "react";
import { Alert } from "react-native";
import {
	createAttachmentId,
	documentAssetToAttachment,
	imageAssetToAttachment,
	type PromptInputAttachmentInput,
} from "@/components/ai-elements/prompt-input";
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

	const add = useCallback(
		(items: PromptInputAttachmentInput[], source: AttachmentSource) => {
			if (items.length === 0) return;
			addForKey(
				key,
				items.map((item) => ({ ...item, id: createAttachmentId() })),
			);
			posthog.capture("attachment_added", {
				source,
				count: items.length,
				composer: composerName(key),
			});
		},
		[key, addForKey],
	);

	const remove = useCallback(
		(id: string) => {
			removeForKey(key, id);
			posthog.capture("attachment_removed", { composer: composerName(key) });
		},
		[key, removeForKey],
	);

	const clear = useCallback(() => clearForKey(key), [key, clearForKey]);

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
