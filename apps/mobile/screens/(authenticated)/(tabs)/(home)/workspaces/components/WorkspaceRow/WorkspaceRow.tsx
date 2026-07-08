import type {
	SelectGithubPullRequest,
	SelectV2Workspace,
} from "@superset/db/schema";
import { formatDistanceToNow } from "date-fns";
import {
	Circle,
	CircleDot,
	Cloud,
	CloudOff,
	GitMerge,
	GitPullRequest,
} from "lucide-react-native";
import { Linking, Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

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

type PrBadgeState = keyof typeof PR_BADGE_CONFIG;

const ADDITIONS_COLOR = "#3fb950";
const DELETIONS_COLOR = "#f85149";

export function WorkspaceRow({
	workspace,
	pullRequest,
	hostOnline,
	onPress,
	onLongPress,
}: {
	workspace: SelectV2Workspace;
	pullRequest?: SelectGithubPullRequest;
	hostOnline?: boolean;
	onPress: () => void;
	onLongPress: () => void;
}) {
	const prState: PrBadgeState | null = pullRequest
		? pullRequest.isDraft && pullRequest.state === "open"
			? "draft"
			: pullRequest.state === "merged"
				? "merged"
				: pullRequest.state === "closed"
					? "closed"
					: "open"
		: null;
	const prBadge = prState ? PR_BADGE_CONFIG[prState] : null;

	const HostIcon =
		hostOnline === undefined ? Circle : hostOnline ? Cloud : CloudOff;

	return (
		<Pressable
			className="flex-row items-center gap-3 px-4 py-3"
			onPress={onPress}
			onLongPress={onLongPress}
		>
			<View className="size-9 items-center justify-center">
				<Icon
					as={HostIcon}
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
						· {formatDistanceToNow(workspace.updatedAt, { addSuffix: true })}
					</Text>
				</View>
			</View>
			<View className="flex-row items-center gap-2">
				{pullRequest ? (
					<Text className="font-mono text-sm">
						<Text
							className="font-mono text-sm"
							style={{ color: ADDITIONS_COLOR }}
						>
							+{pullRequest.additions}
						</Text>{" "}
						<Text
							className="font-mono text-sm"
							style={{ color: DELETIONS_COLOR }}
						>
							−{pullRequest.deletions}
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
	);
}
