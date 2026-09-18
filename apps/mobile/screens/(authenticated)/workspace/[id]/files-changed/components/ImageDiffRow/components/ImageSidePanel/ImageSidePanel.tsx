import { useLingui } from "@lingui/react/macro";
import { Image } from "expo-image";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Text } from "@/components/ui/text";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import {
	type DiffSide,
	useDiffSideImage,
} from "../../../../../hooks/useDiffSideImage";
import type { ChangesetSource } from "../../../../../hooks/useWorkspaceChangeset";
import { IMAGE_PANEL_HEIGHT } from "../../../../utils/diffMetrics";

export function ImageSidePanel({
	hostUrl,
	workspaceId,
	worktreePath,
	category,
	path,
	side,
	caption,
	onPress,
}: {
	hostUrl: string | null;
	workspaceId: string | null;
	worktreePath: string | null;
	category: ChangesetSource;
	path: string;
	side: DiffSide;
	caption: string | null;
	onPress: () => void;
}) {
	const { t } = useLingui();
	const image = useDiffSideImage({
		hostUrl,
		workspaceId,
		worktreePath,
		category,
		path,
		side,
	});
	const [decodeFailed, setDecodeFailed] = useState(false);
	const uri = image.kind === "ready" && !decodeFailed ? image.uri : null;

	return (
		<PressableScale
			accessibilityRole="imagebutton"
			accessibilityLabel={caption ?? path.split("/").pop()}
			disabled={uri === null}
			className="border-border overflow-hidden rounded-md border"
			style={{ height: IMAGE_PANEL_HEIGHT }}
			onPress={onPress}
		>
			{caption ? (
				<View className="border-border border-b px-3 py-1">
					<Text className="text-muted-foreground text-xs">{caption}</Text>
				</View>
			) : null}
			<View className="bg-muted/30 flex-1 items-center justify-center p-2">
				{uri ? (
					<Image
						source={{ uri }}
						contentFit="contain"
						style={{ width: "100%", height: "100%" }}
						onError={() => setDecodeFailed(true)}
					/>
				) : image.kind === "loading" ? (
					<ActivityIndicator />
				) : (
					<Text className="text-muted-foreground text-center text-xs">
						{image.kind === "too-large"
							? t({ message: "File is too large to preview" })
							: t({ message: "Could not load image" })}
					</Text>
				)}
			</View>
		</PressableScale>
	);
}
