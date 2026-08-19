import {
	type AttachmentsSheetAction,
	presentAttachmentsSheet,
} from "@superset/attachments-sheet";
import * as ImagePicker from "expo-image-picker";
import { useCallback } from "react";
import { Alert } from "react-native";
import { useUniwind } from "uniwind";
import {
	imageAssetToAttachment,
	usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { THEME } from "@/lib/theme";

/**
 * Opens the native attachments sheet. Row actions arrive after the sheet's
 * dismissal completes natively, so presenting a second picker never races the
 * sheet's teardown.
 */
export function useAttachmentsSheet() {
	const attachments = usePromptInputAttachments();
	const { theme } = useUniwind();

	return useCallback(() => {
		const openCamera = async () => {
			const permission = await ImagePicker.requestCameraPermissionsAsync();
			if (!permission.granted) {
				Alert.alert("Camera access is not allowed");
				return;
			}
			let result: ImagePicker.ImagePickerResult;
			try {
				result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
			} catch {
				// Rejects where there is no camera (simulator).
				Alert.alert("Camera is not available");
				return;
			}
			if (result.canceled) return;
			const items = await Promise.all(
				result.assets.map(imageAssetToAttachment),
			);
			attachments.add(items.filter((item) => item !== null));
		};

		const handleAction = (action: AttachmentsSheetAction) => {
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
				onAddAssets: (assets) =>
					attachments.add(
						assets.map((asset) => ({ ...asset, type: "image" as const })),
					),
				onAction: handleAction,
			},
		);
	}, [attachments, theme]);
}
