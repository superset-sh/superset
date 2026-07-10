import type { SelectGithubPullRequest } from "@superset/db/schema";
import { formatDistanceToNow } from "date-fns";
import {
	CircleDot,
	Cloud,
	CloudOff,
	GitMerge,
	GitPullRequest,
} from "lucide-react-native";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type {
	HostWorkspaceItem,
	HostWorkspacesCacheOps,
} from "@/hooks/useHostWorkspaces";
import { useTheme } from "@/hooks/useTheme";
import type { DiffStats } from "../../hooks/useVisibleDiffStats";
import { WorkspaceRowMenu } from "./components/WorkspaceRowMenu";

const PR_BADGE_CONFIG = {
	closed: {
		containerClassName: "bg-destructive/10",
		icon: CircleDot,
		iconClassName: "text-destructive",
	},
	draft: {
		containerClassName: "bg-muted",
		icon: GitPullRequest,
		iconClassName: "text-muted-foreground",
	},
	merged: {
		containerClassName: "bg-purple-500/10",
		icon: GitMerge,
		iconClassName: "text-purple-500",
	},
	open: {
		containerClassName: "bg-emerald-500/10",
		icon: GitPullRequest,
		iconClassName: "text-emerald-500",
	},
} as const;

export type PrBadgeState = keyof typeof PR_BADGE_CONFIG;

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
}: {
	workspace: HostWorkspaceItem;
	pullRequest?: SelectGithubPullRequest;
	diffStats: DiffStats | null;
	cache: HostWorkspacesCacheOps;
}) {
	const prBadge = pullRequest ? PR_BADGE_CONFIG[prStateFor(pullRequest)] : null;

	const theme = useTheme();
	const pressProgress = useSharedValue(0);
	const highlightStyle = useAnimatedStyle(() => ({
		opacity: pressProgress.value,
	}));

	return (
		<WorkspaceRowMenu workspace={workspace} cache={cache}>
			<Pressable
				className="bg-background flex-row items-center gap-3 px-4 py-3"
				onPressIn={() => {
					pressProgress.value = withTiming(1, { duration: 300 });
				}}
				onPressOut={() => {
					pressProgress.value = withTiming(0, { duration: 150 });
				}}
			>
				<Animated.View
					pointerEvents="none"
					style={[
						StyleSheet.absoluteFill,
						{ backgroundColor: theme.muted },
						highlightStyle,
					]}
				/>
				<View className="size-9 items-center justify-center">
					<Icon
						as={workspace.hostReachable ? Cloud : CloudOff}
						className="text-muted-foreground size-5"
						strokeWidth={1.75}
					/>
				</View>
				<View className="flex-1 gap-0.5">
					<Text className="font-medium" numberOfLines={1}>
						{workspace.name}
					</Text>
					<View className="flex-row items-center gap-1.5">
						<Text
							className="text-muted-foreground flex-shrink font-mono text-xs"
							numberOfLines={1}
						>
							{workspace.branch}
						</Text>
						<Text className="text-muted-foreground text-xs">
							·{" "}
							{workspace.worktreeExists === false
								? "worktree missing"
								: formatDistanceToNow(workspace.updatedAt, {
										addSuffix: true,
									})}
						</Text>
					</View>
				</View>
				<View className="flex-row items-center gap-2">
					{diffStats && (diffStats.additions > 0 || diffStats.deletions > 0) ? (
						<Text className="font-mono text-sm">
							<Text
								className="font-mono text-sm"
								style={{ color: ADDITIONS_COLOR }}
							>
								+{diffStats.additions}
							</Text>{" "}
							<Text
								className="font-mono text-sm"
								style={{ color: DELETIONS_COLOR }}
							>
								−{diffStats.deletions}
							</Text>
						</Text>
					) : null}
					{pullRequest && prBadge ? (
						<Pressable
							hitSlop={8}
							onPress={() => Linking.openURL(pullRequest.url)}
							className={`flex-row items-center gap-1 rounded-md px-2 py-1 ${prBadge.containerClassName}`}
						>
							<Icon
								as={prBadge.icon}
								className={`size-4 ${prBadge.iconClassName}`}
								strokeWidth={1.75}
							/>
							<Text className="text-muted-foreground font-mono text-xs leading-none">
								#{pullRequest.prNumber}
							</Text>
						</Pressable>
					) : null}
				</View>
			</Pressable>
		</WorkspaceRowMenu>
	);
}
