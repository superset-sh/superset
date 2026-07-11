import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as MediaLibrary from "expo-media-library/legacy";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { MediaPermissionCard } from "../MediaPermissionCard";

const RECENT_PHOTOS_LIMIT = 30;
const THUMBNAIL_SIZE = 96;

export function PhotoCarousel({
	selected,
	onToggle,
}: {
	selected: MediaLibrary.Asset[];
	onToggle: (asset: MediaLibrary.Asset) => void;
}) {
	const [permission, requestPermission] = MediaLibrary.usePermissions();

	const granted = permission?.granted ?? false;

	const { data: assets } = useQuery({
		queryKey: ["media-library", "recent-photos"],
		enabled: granted,
		staleTime: 30_000,
		queryFn: async () => {
			const page = await MediaLibrary.getAssetsAsync({
				first: RECENT_PHOTOS_LIMIT,
				mediaType: "photo",
				sortBy: [["creationTime", false]],
			});
			return page.assets;
		},
	});

	if (!permission) {
		return <View style={{ height: THUMBNAIL_SIZE }} />;
	}

	if (!granted) {
		return (
			<MediaPermissionCard
				permission={permission}
				onRequest={() => void requestPermission()}
				message="Attach images from your photo library."
			/>
		);
	}

	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}
			style={{ flexGrow: 0 }}
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
								height: THUMBNAIL_SIZE,
								opacity: isSelected ? 0.45 : 1,
								width: THUMBNAIL_SIZE,
							}}
						/>
						{isSelected ? (
							<View className="absolute inset-0 items-center justify-center">
								<View className="size-9 items-center justify-center rounded-full bg-white">
									<Text className="font-semibold text-black">
										{selectionIndex + 1}
									</Text>
								</View>
							</View>
						) : null}
					</Pressable>
				);
			})}
			{granted && (assets ?? []).length === 0 ? (
				<View
					className="items-center justify-center"
					style={{ height: THUMBNAIL_SIZE }}
				>
					<Text className="text-muted-foreground text-sm">
						No photos in your library
					</Text>
				</View>
			) : null}
		</ScrollView>
	);
}
