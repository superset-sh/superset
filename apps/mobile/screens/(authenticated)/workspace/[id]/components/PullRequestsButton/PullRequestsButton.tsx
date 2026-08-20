import { GitPullRequest } from "lucide-react-native";
import { Pressable } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import {
	PULL_REQUEST_STATUS,
	pullRequestStatus,
} from "../../utils/pullRequest";

type ColourablePullRequest = Parameters<typeof pullRequestStatus>[0];

/** Chip above the composer; takes the list newest-first and colours itself from its head. */
export function PullRequestsButton({
	pullRequests,
	onPress,
}: {
	pullRequests: ColourablePullRequest[];
	onPress: () => void;
}) {
	const latest = pullRequests[0];
	if (!latest) return null;
	const count = pullRequests.length;
	const label = count === 1 ? "View PR" : `View ${count} PRs`;
	return (
		<Pressable
			accessibilityLabel={
				count === 1 ? "View pull request" : `View ${count} pull requests`
			}
			accessibilityRole="button"
			className="border-border h-8 flex-row items-center gap-1.5 self-start rounded-full border px-3 active:opacity-60"
			onPress={onPress}
		>
			<Icon
				as={GitPullRequest}
				className={cn(
					"size-3.5",
					PULL_REQUEST_STATUS[pullRequestStatus(latest)].ink,
				)}
			/>
			<Text className="text-muted-foreground text-[13px]">{label}</Text>
		</Pressable>
	);
}
