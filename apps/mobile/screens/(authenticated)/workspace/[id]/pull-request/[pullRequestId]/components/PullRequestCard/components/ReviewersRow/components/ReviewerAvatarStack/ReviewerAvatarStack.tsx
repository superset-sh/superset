import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { PullRequestReviewer } from "../../../../../../../../utils/pullRequest";
import { ReviewerAvatar } from "../../../../../ReviewerAvatar";

/** Faces overlap; a dimmed face was asked and has not answered. */
export function ReviewerAvatarStack({
	reviewers,
	max = 3,
	size = 26,
}: {
	reviewers: PullRequestReviewer[];
	max?: number;
	size?: number;
}) {
	const shown = reviewers.slice(0, max);
	const overflow = reviewers.length - shown.length;
	return (
		<View className="flex-row items-center">
			{shown.map((reviewer, index) => (
				<View
					className={cn("bg-card rounded-full p-[1px]", index > 0 && "-ml-2.5")}
					key={`${reviewer.login}-${reviewer.state}`}
				>
					<ReviewerAvatar
						dimmed={reviewer.state === "REQUESTED"}
						reviewer={reviewer}
						size={size}
					/>
				</View>
			))}
			{overflow > 0 ? (
				<View className="bg-card -ml-2.5 rounded-full p-[1px]">
					<View
						className="bg-secondary items-center justify-center"
						style={{ width: size, height: size, borderRadius: size / 2 }}
					>
						<Text className="text-muted-foreground font-semibold text-[11px]">
							+{overflow}
						</Text>
					</View>
				</View>
			) : null}
		</View>
	);
}
