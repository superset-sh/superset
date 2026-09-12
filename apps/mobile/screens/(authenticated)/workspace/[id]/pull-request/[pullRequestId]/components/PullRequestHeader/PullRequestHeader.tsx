import { Plural, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import {
	PULL_REQUEST_STATUS,
	type PullRequest,
	pullRequestStatus,
} from "../../../../utils/pullRequest";

/**
 * State, diffstat, title. Above the card, never inside it.
 *
 * The diffstat opens the files: changes are reviewed through the pull request,
 * so its own summary of them is the way in, rather than a separate button
 * competing with the card's actions.
 */
export function PullRequestHeader({
	pullRequest,
	queued,
	onOpenFiles,
}: {
	pullRequest: PullRequest;
	queued?: boolean;
	onOpenFiles?: () => void;
}) {
	const { t } = useLingui();
	const status =
		PULL_REQUEST_STATUS[pullRequestStatus(pullRequest, queued === true)];
	return (
		<View className="mx-4 gap-3">
			<View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
				<Text
					className={cn(
						"overflow-hidden rounded-full px-2.5 py-1 font-semibold text-[12px]",
						status.surface,
						status.ink,
					)}
				>
					{i18n._(status.label)}
				</Text>
				<Pressable
					accessibilityLabel={t({
						message: "View files changed",
					})}
					accessibilityRole={onOpenFiles ? "button" : undefined}
					className="flex-row items-center gap-1.5 active:opacity-60"
					disabled={!onOpenFiles}
					onPress={onOpenFiles}
				>
					<Text className="text-green-500 font-semibold text-[13px]">
						+{pullRequest.additions}
					</Text>
					<Text className="text-red-500 font-semibold text-[13px]">
						−{pullRequest.deletions}
					</Text>
					<Text className="text-muted-foreground text-[13px]">
						·{" "}
						<Plural
							value={pullRequest.changedFiles}
							one="# File"
							other="# Files"
						/>
					</Text>
				</Pressable>
			</View>
			<Text
				className="font-semibold text-[19px] leading-[25px] tracking-[-0.3px]"
				numberOfLines={3}
			>
				{pullRequest.title}
				<Text className="text-muted-foreground/70 font-semibold text-[19px]">
					{" "}
					#{pullRequest.number}
				</Text>
			</Text>
		</View>
	);
}
