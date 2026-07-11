import { BlurView } from "expo-blur";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as MediaLibrary from "expo-media-library/legacy";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePromptInputAttachments } from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { useAttachmentsSelectionStore } from "../../stores/attachmentsSelectionStore";

export function AddSelectedButton() {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const attachments = usePromptInputAttachments();
	const selected = useAttachmentsSelectionStore((store) => store.selected);
	const clear = useAttachmentsSelectionStore((store) => store.clear);
	const [adding, setAdding] = useState(false);

	if (selected.length === 0) return null;

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
			clear();
			router.dismiss();
		} catch (error) {
			Alert.alert(
				"Could not add photos",
				error instanceof Error ? error.message : String(error),
			);
		} finally {
			setAdding(false);
		}
	};

	return (
		<BlurView
			intensity={15}
			tint="dark"
			style={{
				position: "absolute",
				left: 0,
				right: 0,
				bottom: 0,
				paddingTop: 8,
				paddingHorizontal: 20,
				paddingBottom: Math.max(insets.bottom, 16),
			}}
		>
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
		</BlurView>
	);
}
