import { useWindowDimensions, View } from "react-native";
import { AddSelectedButton } from "../components/AddSelectedButton";
import { useAttachmentsSelectionStore } from "../stores/attachmentsSelectionStore";
import { ScreenshotGrid } from "./components/ScreenshotGrid";

// Screen content must be natural-height inside the formSheet (parent-derived
// heights collapse on cold mount), so the grid gets an explicit height.
const GRID_HEIGHT_FRACTION = 0.72;

export function ScreenshotsScreen() {
	const { height } = useWindowDimensions();
	const selected = useAttachmentsSelectionStore((store) => store.selected);
	const toggleAsset = useAttachmentsSelectionStore(
		(store) => store.toggleAsset,
	);
	return (
		<View className="bg-background flex-1 pt-3">
			<View style={{ height: height * GRID_HEIGHT_FRACTION }}>
				<ScreenshotGrid selected={selected} onToggle={toggleAsset} />
			</View>
			<AddSelectedButton />
		</View>
	);
}
