import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import {
	background,
	environment,
	frame,
	presentationBackground,
	presentationDetents,
	presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import Ionicons from "@expo/vector-icons/Ionicons";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library/legacy";
import { useCallback, useState } from "react";
import { Alert, Pressable, useWindowDimensions, View } from "react-native";
import { usePromptInputAttachments } from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { hslToHex } from "../../../../utils/hslToHex";
import { PhotoCarousel } from "./components/PhotoCarousel";

// Pickers present their own view controller; wait for the sheet's
// dismissal animation or iOS drops the second presentation.
const SHEET_DISMISS_DELAY_MS = 400;

export function ContextSheet({
	isPresented,
	onIsPresentedChange,
}: {
	isPresented: boolean;
	onIsPresentedChange: (value: boolean) => void;
}) {
	const theme = useTheme();
	const { width } = useWindowDimensions();
	const attachments = usePromptInputAttachments();
	const [selected, setSelected] = useState<MediaLibrary.Asset[]>([]);
	const [adding, setAdding] = useState(false);

	const handlePresentedChange = useCallback(
		(value: boolean) => {
			if (!value) setSelected([]);
			onIsPresentedChange(value);
		},
		[onIsPresentedChange],
	);

	const toggleAsset = useCallback((asset: MediaLibrary.Asset) => {
		setSelected((previous) =>
			previous.some((entry) => entry.id === asset.id)
				? previous.filter((entry) => entry.id !== asset.id)
				: [...previous, asset],
		);
	}, []);

	const runAfterDismiss = (action: () => void) => {
		handlePresentedChange(false);
		setTimeout(action, SHEET_DISMISS_DELAY_MS);
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

	const handleAddSelected = async () => {
		setAdding(true);
		try {
			const items = await Promise.all(
				selected.map(async (asset) => {
					const info = await MediaLibrary.getAssetInfoAsync(asset);
					// Library assets are often HEIC, which the agent API
					// rejects — transcode to JPEG.
					const converted = await manipulateAsync(
						info.localUri ?? asset.uri,
						[],
						{ compress: 0.8, format: SaveFormat.JPEG },
					);
					return {
						mediaType: "image/jpeg",
						name: asset.filename,
						type: "image" as const,
						uri: converted.uri,
					};
				}),
			);
			attachments.add(items);
			handlePresentedChange(false);
		} catch (error) {
			Alert.alert(
				"Could not add photos",
				error instanceof Error ? error.message : String(error),
			);
		} finally {
			setAdding(false);
		}
	};

	const rows = [
		{
			icon: "images-outline" as const,
			label: "Photos",
			action: () => void attachments.openImagePicker(),
		},
		{
			icon: "camera-outline" as const,
			label: "Camera",
			action: () => void openCamera(),
		},
		{
			icon: "document-outline" as const,
			label: "Files",
			action: () => void attachments.openFilePicker(),
		},
	];

	return (
		<Host style={{ position: "absolute", width }}>
			<BottomSheet
				isPresented={isPresented}
				onIsPresentedChange={handlePresentedChange}
			>
				<Group
					modifiers={[
						environment("colorScheme", "dark"),
						presentationDetents(["medium", "large"]),
						presentationDragIndicator("visible"),
						background(theme.background),
						presentationBackground(hslToHex(theme.background)),
						frame({ maxHeight: 10_000, alignment: "top" }),
					]}
				>
					<RNHostView matchContents>
						<View className="pb-6 pt-5">
							<Text
								className="mb-3 px-5 text-center text-lg font-semibold"
								style={{ color: theme.foreground }}
							>
								Context
							</Text>
							<PhotoCarousel
								active={isPresented}
								selected={selected}
								onToggle={toggleAsset}
							/>
							<View className="px-5 pt-4">
								<Text
									className="mb-1 text-sm font-semibold"
									style={{ color: theme.mutedForeground }}
								>
									Add
								</Text>
								{rows.map((row) => (
									<Pressable
										key={row.label}
										onPress={() => runAfterDismiss(row.action)}
										className="flex-row items-center gap-2.5 py-2.5"
									>
										<Ionicons
											name={row.icon}
											size={24}
											color={theme.mutedForeground}
										/>
										<Text
											className="text-sm font-medium"
											style={{ color: theme.foreground }}
										>
											{row.label}
										</Text>
									</Pressable>
								))}
							</View>
							{selected.length > 0 ? (
								<View className="px-5 pt-2">
									<Button
										className="rounded-full"
										disabled={adding}
										onPress={() => void handleAddSelected()}
										size="lg"
									>
										{adding ? (
											<Spinner size="small" />
										) : (
											<Text>
												{selected.length === 1
													? "Add"
													: `Add ${selected.length}`}
											</Text>
										)}
									</Button>
								</View>
							) : null}
						</View>
					</RNHostView>
				</Group>
			</BottomSheet>
		</Host>
	);
}
