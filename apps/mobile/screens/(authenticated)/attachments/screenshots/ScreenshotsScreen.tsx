import * as MediaLibrary from "expo-media-library/legacy";
import { useWindowDimensions, View } from "react-native";
import { AddSelectedButton } from "../components/AddSelectedButton";
import { MediaPermissionCard } from "../components/MediaPermissionCard";
import { useAttachmentsSelectionStore } from "../stores/attachmentsSelectionStore";
import { ScreenshotGrid } from "./components/ScreenshotGrid";

// Screen content must be natural-height inside the formSheet (parent-derived
// heights collapse on cold mount), so the grid gets an explicit height that
// fits the sheet's single 0.5 detent minus the nested-stack header. The
// AddSelectedButton anchors to this container too — a flex-derived root has
// no height here, which left the button invisible.
const GRID_HEIGHT_FRACTION = 0.38;

export function ScreenshotsScreen() {
	const { height } = useWindowDimensions();
	const selected = useAttachmentsSelectionStore((store) => store.selected);
	const toggleAsset = useAttachmentsSelectionStore(
		(store) => store.toggleAsset,
	);
	// request: true → the system permission prompt shows on open.
	const [permission, requestPermission] = MediaLibrary.usePermissions({
		request: true,
	});

	return (
		<View className="bg-background flex-1 pt-3">
			<View style={{ height: height * GRID_HEIGHT_FRACTION }}>
				{permission && !permission.granted ? (
					<MediaPermissionCard
						permission={permission}
						onRequest={() => void requestPermission()}
						message="Allow photo access to attach screenshots."
					/>
				) : null}
				{permission?.granted ? (
					<ScreenshotGrid selected={selected} onToggle={toggleAsset} />
				) : null}
				<AddSelectedButton />
			</View>
		</View>
	);
}
