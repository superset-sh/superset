import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { Alert, Pressable, View } from "react-native";
import { usePromptInputAttachments } from "@/components/ai-elements/prompt-input";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { useAfterTransitionEnd } from "@/screens/(authenticated)/(home)/hooks/useAfterTransitionEnd";
import { AddSelectedButton } from "./components/AddSelectedButton";
import { PhotoCarousel } from "./components/PhotoCarousel";
import { useAttachmentsSelectionStore } from "./stores/attachmentsSelectionStore";

export function AttachmentsScreen() {
	const router = useRouter();
	const theme = useTheme();
	const attachments = usePromptInputAttachments();
	const afterTransitionEnd = useAfterTransitionEnd();
	const selected = useAttachmentsSelectionStore((store) => store.selected);
	const toggleAsset = useAttachmentsSelectionStore(
		(store) => store.toggleAsset,
	);
	const clear = useAttachmentsSelectionStore((store) => store.clear);

	useEffect(() => clear, [clear]);

	// Pickers present their own view controller; iOS drops the second
	// presentation unless the sheet's dismissal has fully finished.
	const runAfterDismiss = (action: () => void) => {
		afterTransitionEnd(action);
		router.back();
	};

	const openCamera = async () => {
		const permission = await ImagePicker.requestCameraPermissionsAsync();
		if (!permission.granted) {
			Alert.alert("Camera access is not allowed");
			return;
		}
		const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
		if (result.canceled) return;
		attachments.add(
			result.assets.map((asset) => ({
				mediaType: asset.mimeType,
				name: asset.fileName ?? undefined,
				size: asset.fileSize,
				type: "image" as const,
				uri: asset.uri,
			})),
		);
	};

	const mainRows = [
		{
			icon: "images-outline" as const,
			label: "Photos",
			onPress: () => runAfterDismiss(() => void attachments.openImagePicker()),
		},
		{
			icon: "scan-outline" as const,
			label: "Screenshots",
			onPress: () =>
				router.push("/(authenticated)/(home)/attachments/screenshots"),
			showsChevron: true,
		},
		{
			icon: "camera-outline" as const,
			label: "Camera",
			onPress: () => runAfterDismiss(() => void openCamera()),
		},
		{
			icon: "document-outline" as const,
			label: "Files",
			onPress: () => runAfterDismiss(() => void attachments.openFilePicker()),
		},
	];

	return (
		<View className="bg-background flex-1">
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button icon="xmark" onPress={() => router.back()} />
			</Stack.Toolbar>
			<View className="pt-3">
				<PhotoCarousel selected={selected} onToggle={toggleAsset} />
				<View className="px-5 pt-4">
					{mainRows.map((row) => (
						<Pressable
							key={row.label}
							onPress={row.onPress}
							className="flex-row items-center gap-2.5 py-2.5"
						>
							<Ionicons
								name={row.icon}
								size={24}
								color={theme.mutedForeground}
							/>
							<Text
								className="flex-1 text-sm font-medium"
								style={{ color: theme.foreground }}
							>
								{row.label}
							</Text>
							{row.showsChevron ? (
								<Ionicons
									name="chevron-forward"
									size={16}
									color={theme.mutedForeground}
								/>
							) : null}
						</Pressable>
					))}
				</View>
			</View>
			<AddSelectedButton />
		</View>
	);
}
