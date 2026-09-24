import { Trans, useLingui } from "@lingui/react/macro";
import { ChevronRight } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { openUrl } from "@/lib/open-url";
import { useWorkspacePullRequests } from "../../../hooks/useWorkspacePullRequest";
import {
	PULL_REQUEST_STATUS,
	pullRequestStatus,
} from "../../../utils/pullRequest";

export function WorkspacePullRequests({
	workspaceId,
}: {
	workspaceId: string | null;
}) {
	const { t } = useLingui();
	const pullRequests = useWorkspacePullRequests(workspaceId);

	if (pullRequests.length === 0) return null;

	return (
		<View>
			<Text className="text-muted-foreground mt-9 pb-1 text-[15px]">
				<Trans>PR</Trans>
			</Text>
			{pullRequests.map((pullRequest, index) => {
				const status = PULL_REQUEST_STATUS[pullRequestStatus(pullRequest)];
				return (
					<Pressable
						key={pullRequest.key}
						accessibilityLabel={t({
							message: `Pull request #${pullRequest.prNumber}`,
						})}
						accessibilityRole="link"
						onPress={() => openUrl(pullRequest.url)}
						className={
							index === pullRequests.length - 1
								? "flex-row items-center gap-3 py-3.5 active:opacity-60"
								: "border-border/60 flex-row items-center gap-3 border-b py-3.5 active:opacity-60"
						}
					>
						<Icon
							as={status.icon}
							className={`size-[18px] ${status.ink}`}
							strokeWidth={1.75}
						/>
						<Text className="flex-1 text-[15px]" numberOfLines={2}>
							{pullRequest.title}{" "}
							<Text className="text-muted-foreground text-[15px]">
								#{pullRequest.prNumber}
							</Text>
						</Text>
						<Icon
							as={ChevronRight}
							className="text-muted-foreground/60 size-4"
						/>
					</Pressable>
				);
			})}
		</View>
	);
}
