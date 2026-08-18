import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as MediaLibrary from "expo-media-library/legacy";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";

const SCREENSHOTS_LIMIT = 100;
const GRID_COLUMNS = 4;
const GRID_GAP = 6;
const GRID_HORIZONTAL_PADDING = 20;
const GRID_BOTTOM_PADDING = 12;

/** Renders once photo permission is granted — the screen gates on it. */
export function ScreenshotGrid({
	selected,
	onToggle,
}: {
	selected: MediaLibrary.Asset[];
	onToggle: (asset: MediaLibrary.Asset) => void;
}) {
	const theme = useTheme();
	const { width } = useWindowDimensions();

	const { data: assets, isLoading } = useQuery({
		queryKey: ["media-library", "screenshots"],
		staleTime: 30_000,
		queryFn: async () => {
			const albums = await MediaLibrary.getAlbumsAsync({
				includeSmartAlbums: true,
			});
			const screenshotsAlbum = albums.find(
				(album) => album.type === "smartAlbum" && album.title === "Screenshots",
			);
			if (!screenshotsAlbum) return [];
			const page = await MediaLibrary.getAssetsAsync({
				album: screenshotsAlbum,
				first: SCREENSHOTS_LIMIT,
				mediaType: "photo",
				sortBy: [["creationTime", false]],
			});
			return page.assets;
		},
	});

	const tileSize =
		(width - GRID_HORIZONTAL_PADDING * 2 - GRID_GAP * (GRID_COLUMNS - 1)) /
		GRID_COLUMNS;

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{
				flexDirection: "row",
				flexGrow: 1,
				flexWrap: "wrap",
				gap: GRID_GAP,
				paddingBottom: GRID_BOTTOM_PADDING,
				paddingHorizontal: GRID_HORIZONTAL_PADDING,
			}}
		>
			{(assets ?? []).map((asset) => {
				const selectionIndex = selected.findIndex(
					(entry) => entry.id === asset.id,
				);
				const isSelected = selectionIndex >= 0;
				return (
					<Pressable
						accessibilityRole="button"
						accessibilityState={{ selected: isSelected }}
						key={asset.id}
						onPress={() => onToggle(asset)}
					>
						<Image
							contentFit="cover"
							source={{ uri: asset.uri }}
							style={{
								borderRadius: 8,
								height: tileSize,
								opacity: isSelected ? 0.45 : 1,
								width: tileSize,
							}}
						/>
						{isSelected ? (
							<View className="absolute inset-0 items-center justify-center">
								<View className="size-8 items-center justify-center rounded-full bg-white">
									<Text className="font-semibold text-black">
										{selectionIndex + 1}
									</Text>
								</View>
							</View>
						) : null}
					</Pressable>
				);
			})}
			{isLoading ? (
				<View className="w-full items-center py-10">
					<Spinner size="small" />
				</View>
			) : null}
			{!isLoading && (assets ?? []).length === 0 ? (
				<Text
					className="w-full py-10 text-center text-sm"
					style={{ color: theme.mutedForeground }}
				>
					No screenshots found
				</Text>
			) : null}
		</ScrollView>
	);
}
