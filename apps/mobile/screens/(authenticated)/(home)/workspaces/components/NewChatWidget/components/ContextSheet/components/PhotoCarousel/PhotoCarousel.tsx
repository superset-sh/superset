import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as MediaLibrary from "expo-media-library/legacy";
import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

const RECENT_PHOTOS_LIMIT = 30;
const THUMBNAIL_SIZE = 96;

export function PhotoCarousel({
	active,
	selected,
	onToggle,
}: {
	active: boolean;
	selected: MediaLibrary.Asset[];
	onToggle: (asset: MediaLibrary.Asset) => void;
}) {
	const [permission, setPermission] =
		useState<MediaLibrary.PermissionResponse | null>(null);

	useEffect(() => {
		if (!active) return;
		void MediaLibrary.getPermissionsAsync().then(setPermission);
	}, [active]);

	const granted = permission?.granted ?? false;

	const { data: assets } = useQuery({
		queryKey: ["media-library", "recent-photos"],
		enabled: active && granted,
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
		const mustUseSettings = !permission.canAskAgain;
		return (
			<View className="mx-5 items-center gap-3 rounded-xl bg-secondary px-4 py-5">
				<Text className="text-center text-secondary-foreground text-sm">
					Attach images from your photo library.
				</Text>
				<Button
					size="sm"
					variant="outline"
					className="rounded-full"
					onPress={() => {
						if (mustUseSettings) {
							void Linking.openSettings();
							return;
						}
						void MediaLibrary.requestPermissionsAsync().then(setPermission);
					}}
				>
					<Text>{mustUseSettings ? "Open Settings" : "Continue"}</Text>
				</Button>
			</View>
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
								borderRadius: 12,
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
