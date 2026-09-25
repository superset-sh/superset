import { Image } from "expo-image";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { PullRequestReviewer } from "../../../../utils/pullRequest";

export function ReviewerAvatar({
	reviewer,
	size = 26,
	dimmed,
}: {
	reviewer: PullRequestReviewer;
	size?: number;
	dimmed?: boolean;
}) {
	const style = { width: size, height: size, borderRadius: size / 2 };
	if (reviewer.avatarUrl && !reviewer.isTeam) {
		return (
			<Image
				contentFit="cover"
				source={{ uri: reviewer.avatarUrl }}
				style={[style, dimmed ? { opacity: 0.45 } : null]}
				transition={120}
			/>
		);
	}
	return (
		<View
			className={cn(
				"items-center justify-center",
				reviewer.isTeam ? "bg-muted" : "bg-secondary",
				dimmed && "opacity-45",
			)}
			style={style}
		>
			<Text
				className="text-muted-foreground font-semibold"
				style={{ fontSize: Math.round(size * 0.42) }}
			>
				{reviewer.isTeam ? "◇" : reviewer.login.slice(0, 1).toUpperCase()}
			</Text>
		</View>
	);
}
