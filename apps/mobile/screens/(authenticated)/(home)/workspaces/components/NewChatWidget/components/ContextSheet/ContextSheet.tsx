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
import { SheetCloseButton } from "@/screens/(authenticated)/(home)/components/SheetCloseButton";
import { hslToHex } from "../../../../utils/hslToHex";
import { PhotoCarousel } from "./components/PhotoCarousel";
import { ScreenshotGrid } from "./components/ScreenshotGrid";

// Pickers present their own view controller; wait for the sheet's
// dismissal animation or iOS drops the second presentation.
const SHEET_DISMISS_DELAY_MS = 400;
const LARGE_DETENT_FRACTION = 0.88;

type SheetView = "main" | "screenshots";
type SheetDetent = "medium" | "large";

export function ContextSheet({
	isPresented,
	onIsPresentedChange,
}: {
	isPresented: boolean;
	onIsPresentedChange: (value: boolean) => void;
}) {
	const theme = useTheme();
	const { width, height } = useWindowDimensions();
	const attachments = usePromptInputAttachments();
	const [selected, setSelected] = useState<MediaLibrary.Asset[]>([]);
	const [adding, setAdding] = useState(false);
	const [view, setView] = useState<SheetView>("main");
	const [detent, setDetent] = useState<SheetDetent>("medium");

	const handlePresentedChange = useCallback(
		(value: boolean) => {
			if (!value) {
				setSelected([]);
				setView("main");
				setDetent("medium");
			}
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

	const openScreenshots = () => {
		setView("screenshots");
		setDetent("large");
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

	const mainRows = [
		{
			icon: "images-outline" as const,
			label: "Photos",
			onPress: () => runAfterDismiss(() => void attachments.openImagePicker()),
		},
		{
			icon: "scan-outline" as const,
			label: "Screenshots",
			onPress: openScreenshots,
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

	const addButton =
		selected.length > 0 ? (
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
							{selected.length === 1 ? "Add" : `Add ${selected.length}`}
						</Text>
					)}
				</Button>
			</View>
		) : null;

	return (
		<Host style={{ position: "absolute", width }}>
			<BottomSheet
				isPresented={isPresented}
				onIsPresentedChange={handlePresentedChange}
			>
				<Group
					modifiers={[
						environment("colorScheme", "dark"),
						presentationDetents(["medium", "large"], {
							selection: detent,
							onSelectionChange: (selection) => {
								if (selection === "medium" || selection === "large") {
									setDetent(selection);
								}
							},
						}),
						presentationDragIndicator("visible"),
						background(theme.background),
						presentationBackground(hslToHex(theme.background)),
						frame({ maxHeight: 10_000, alignment: "top" }),
					]}
				>
					<RNHostView matchContents>
						{view === "screenshots" ? (
							<View
								className="pb-6 pt-5"
								style={{ height: height * LARGE_DETENT_FRACTION }}
							>
								<View className="relative mb-3 items-center justify-center">
									<Pressable
										accessibilityLabel="Back"
										className="absolute left-4 size-9 items-center justify-center rounded-full bg-secondary"
										onPress={() => setView("main")}
									>
										<Ionicons
											name="chevron-back"
											size={20}
											color={theme.foreground}
										/>
									</Pressable>
									<Text
										className="text-center text-lg font-semibold"
										style={{ color: theme.foreground }}
									>
										Screenshots
									</Text>
								</View>
								<ScreenshotGrid
									active={isPresented && view === "screenshots"}
									selected={selected}
									onToggle={toggleAsset}
								/>
								{addButton}
							</View>
						) : (
							<View className="pb-6 pt-5">
								<View className="relative mb-3 items-center justify-center px-5">
									<View className="absolute left-5">
										<SheetCloseButton
											onPress={() => handlePresentedChange(false)}
										/>
									</View>
									<Text
										className="text-center text-lg font-semibold"
										style={{ color: theme.foreground }}
									>
										Context
									</Text>
								</View>
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
								{addButton}
							</View>
						)}
					</RNHostView>
				</Group>
			</BottomSheet>
		</Host>
	);
}
