import type { SelectGithubPullRequest } from "@superset/db/schema";
import {
	GitMerge,
	GitPullRequest,
	GitPullRequestClosed,
	GitPullRequestDraft,
	Plus,
} from "lucide-react-native";
import { Linking, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type {
	HostWorkspaceItem,
	HostWorkspacesCacheOps,
} from "@/hooks/useHostWorkspaces";
import { cn } from "@/lib/utils";
import type { DiffStats } from "../../hooks/useVisibleDiffStats";
import { WorkspaceRowMenu } from "./components/WorkspaceRowMenu";

// PR state replaces the host icon in the icon slot — same treatment as
// desktop's DashboardSidebarWorkspaceIcon.
const PR_ICON_CONFIG = {
	closed: { icon: GitPullRequestClosed, iconClassName: "text-destructive" },
	draft: { icon: GitPullRequestDraft, iconClassName: "text-muted-foreground" },
	merged: { icon: GitMerge, iconClassName: "text-purple-500" },
	open: { icon: GitPullRequest, iconClassName: "text-emerald-500" },
} as const;

export type PrBadgeState = keyof typeof PR_ICON_CONFIG;

export function prStateFor(pullRequest: SelectGithubPullRequest): PrBadgeState {
	if (pullRequest.mergedAt != null) return "merged";
	if (pullRequest.isDraft) return "draft";
	if (pullRequest.state === "closed") return "closed";
	return "open";
}

const ADDITIONS_COLOR = "#3fb950";
const DELETIONS_COLOR = "#f85149";

export function WorkspaceRow({
	workspace,
	pullRequest,
	diffStats,
	cache,
	onNewChat,
	attention,
}: {
	workspace: HostWorkspaceItem;
	pullRequest?: SelectGithubPullRequest;
	diffStats: DiffStats | null;
	cache: HostWorkspacesCacheOps;
	onNewChat?: () => void;
	attention?: "permission" | "working" | null;
}) {
	const prIcon = pullRequest ? PR_ICON_CONFIG[prStateFor(pullRequest)] : null;

	return (
		<WorkspaceRowMenu workspace={workspace} cache={cache}>
			<View className="bg-background flex-row items-center gap-3 px-4 py-3">
				{prIcon && pullRequest ? (
					<Button
						accessibilityLabel={`Open pull request #${pullRequest.prNumber}`}
						variant="ghost"
						size="icon"
						className="size-6"
						hitSlop={8}
						onPress={() => void Linking.openURL(pullRequest.url)}
					>
						<Icon
							as={prIcon.icon}
							className={`size-5 ${prIcon.iconClassName}`}
							strokeWidth={1.75}
						/>
					</Button>
				) : (
					<View className="size-6 items-center justify-center">
						<View
							className={cn(
								"size-2.5 rounded-full",
								attention === "permission"
									? "bg-red-500"
									: attention === "working"
										? "bg-amber-500"
										: "bg-muted-foreground/40",
							)}
						/>
					</View>
				)}
				<View className="flex-1">
					<Text className="font-medium" numberOfLines={1}>
						{workspace.name}
					</Text>
					<View className="flex-row items-center gap-2">
						<Text
							className="text-muted-foreground shrink text-xs"
							numberOfLines={1}
						>
							{workspace.branch}
						</Text>
						{diffStats &&
						(diffStats.additions > 0 || diffStats.deletions > 0) ? (
							<>
								<Text className="text-muted-foreground text-xs">·</Text>
								<Text className="font-mono text-xs">
									<Text
										className="font-mono text-xs"
										style={{ color: ADDITIONS_COLOR }}
									>
										+{diffStats.additions}
									</Text>{" "}
									<Text
										className="font-mono text-xs"
										style={{ color: DELETIONS_COLOR }}
									>
										−{diffStats.deletions}
									</Text>
								</Text>
							</>
						) : null}
					</View>
				</View>
				{onNewChat ? (
					<Button
						accessibilityLabel="New chat"
						variant="ghost"
						size="icon"
						className="size-7"
						hitSlop={8}
						onPress={onNewChat}
					>
						<Icon
							as={Plus}
							className="text-muted-foreground size-4"
							strokeWidth={2}
						/>
					</Button>
				) : null}
			</View>
		</WorkspaceRowMenu>
	);
}
