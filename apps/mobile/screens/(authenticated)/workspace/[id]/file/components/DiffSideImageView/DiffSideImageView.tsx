import { Trans } from "@lingui/react/macro";
import { Image } from "expo-image";
import { useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import type { DiffSideImage } from "../../../hooks/useDiffSideImage";

const MAX_ZOOM = 6;

export function DiffSideImageView({
	image,
	accessibilityLabel,
}: {
	image: DiffSideImage;
	accessibilityLabel: string;
}) {
	const [decodeFailed, setDecodeFailed] = useState(false);
	const uri = image.kind === "ready" && !decodeFailed ? image.uri : null;

	return (
		<ScrollView
			className="bg-background flex-1"
			contentContainerStyle={{ flexGrow: 1 }}
			maximumZoomScale={uri ? MAX_ZOOM : 1}
			showsHorizontalScrollIndicator={false}
			showsVerticalScrollIndicator={false}
		>
			{uri ? (
				<Image
					accessibilityLabel={accessibilityLabel}
					source={{ uri }}
					contentFit="contain"
					style={{ flex: 1 }}
					onError={() => setDecodeFailed(true)}
				/>
			) : (
				<View className="flex-1 items-center justify-center px-10">
					{image.kind === "loading" ? (
						<ActivityIndicator />
					) : (
						<Text className="text-muted-foreground text-center text-sm">
							{image.kind === "too-large" ? (
								<Trans>File is too large to preview</Trans>
							) : (
								<Trans>Could not load image</Trans>
							)}
						</Text>
					)}
				</View>
			)}
		</ScrollView>
	);
}
