import { useLingui } from "@lingui/react/macro";
import {
	type AttachmentsSheetAction,
	presentAttachmentsSheet,
} from "@superset/attachments-sheet";
import * as ImagePicker from "expo-image-picker";
import { useCallback } from "react";
import { Alert } from "react-native";
import { useUniwind } from "uniwind";
import { imageAssetToAttachment } from "@/components/ai-elements/prompt-input";
import { posthog } from "@/lib/posthog";
import { THEME } from "@/lib/theme";
import { useComposerDraft } from "@/screens/(authenticated)/hooks/useComposerDraft";
import { HOME_DRAFT_KEY } from "@/screens/(authenticated)/stores/composerDraftsStore";

/**
 * Opens the native attachments sheet. Row actions arrive after the sheet's
 * dismissal completes natively, so presenting a second picker never races the
 * sheet's teardown.
 *
 * Takes the surface's draft key: whatever the sheet adds belongs to the
 * composer that opened it.
 */
export function useAttachmentsSheet(draftKey: string) {
	const { t } = useLingui();
	const attachments = useComposerDraft(draftKey);
	const { theme } = useUniwind();

	return useCallback(
		(options?: { onClosed?: () => void }) => {
			const composer = draftKey === HOME_DRAFT_KEY ? "home" : "workspace";
			posthog.capture("attachments_sheet_opened", { composer });

			const openCamera = async () => {
				const permission = await ImagePicker.requestCameraPermissionsAsync();
				if (!permission.granted) {
					Alert.alert(
						t({
							message: "Camera access is not allowed",
						}),
					);
					return;
				}
				let result: ImagePicker.ImagePickerResult;
				try {
					result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
				} catch {
					// Rejects where there is no camera (simulator).
					Alert.alert(
						t({
							message: "Camera is not available",
						}),
					);
					return;
				}
				if (result.canceled) return;
				const items = await Promise.all(
					result.assets.map(imageAssetToAttachment),
				);
				attachments.add(
					items.filter((item) => item !== null),
					"camera",
				);
			};

			const handleAction = (action: AttachmentsSheetAction) => {
				options?.onClosed?.();
				if (action === "photos") void attachments.openImagePicker();
				else if (action === "camera") void openCamera();
				else void attachments.openFilePicker();
			};

			const colors = THEME[theme];
			void presentAttachmentsSheet(
				{
					colorScheme: theme,
					background: colors.background,
					foreground: colors.foreground,
					mutedForeground: colors.mutedForeground,
					border: colors.border,
					secondary: colors.secondary,
					secondaryForeground: colors.secondaryForeground,
					primary: colors.primary,
					primaryForeground: colors.primaryForeground,
				},
				{
					onAddAssets: (assets) => {
						options?.onClosed?.();
						attachments.add(
							assets.map((asset) => ({ ...asset, type: "image" as const })),
							"photos",
						);
					},
					onAction: handleAction,
					// Plain dismissal, with neither assets nor a row action.
					onDismiss: () => options?.onClosed?.(),
				},
			);
		},
		[attachments, draftKey, theme, t],
	);
}
