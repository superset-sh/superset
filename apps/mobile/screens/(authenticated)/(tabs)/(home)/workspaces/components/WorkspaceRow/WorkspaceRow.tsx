import { Button, ContextMenu, Host, RNHostView } from "@expo/ui/swift-ui";
import type {
	SelectGithubPullRequest,
	SelectV2Workspace,
} from "@superset/db/schema";
import { CircleDot, GitMerge, GitPullRequest } from "lucide-react-native";
import { Alert, Linking, Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { parseDate } from "@/lib/dates";
import { apiClient } from "@/lib/trpc/client";
import { OrganizationAvatar } from "../OrganizationSwitcherSheet/components/OrganizationAvatar";

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

export const WORKSPACE_ROW_HEIGHT = 60;

const ADDITIONS_COLOR = "#3fb950";
const DELETIONS_COLOR = "#f85149";

export function relativeTime(date: Date | string): string {
	const ms = Date.now() - parseDate(date).getTime();
	const minutes = Math.max(1, Math.floor(ms / 60_000));
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d`;
	const weeks = Math.floor(days / 7);
	if (weeks < 5) return `${weeks}w`;
	const months = Math.floor(days / 30);
	return `${months}mo`;
}

export function WorkspaceRow({
	workspace,
	pullRequest,
	creator,
	onPress,
}: {
	workspace: SelectV2Workspace;
	pullRequest?: SelectGithubPullRequest;
	creator?: { name?: string | null; image?: string | null };
	onPress: () => void;
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

	const handleRename = () => {
		Alert.prompt(
			"Rename workspace",
			undefined,
			[
				{ style: "cancel", text: "Cancel" },
				{
					onPress: async (name?: string) => {
						const trimmed = name?.trim();
						if (!trimmed || trimmed === workspace.name) return;
						try {
							await apiClient.v2Workspace.update.mutate({
								id: workspace.id,
								name: trimmed,
							});
						} catch {
							Alert.alert("Rename failed");
						}
					},
					text: "Rename",
				},
			],
			"plain-text",
			workspace.name,
		);
	};

	const handleDelete = () => {
		Alert.alert("Delete workspace", `Delete "${workspace.name}"?`, [
			{ style: "cancel", text: "Cancel" },
			{
				onPress: async () => {
					try {
						await apiClient.v2Workspace.delete.mutate({ id: workspace.id });
					} catch {
						Alert.alert("Delete failed");
					}
				},
				style: "destructive",
				text: "Delete",
			},
		]);
	};

	return (
		<Host style={{ height: WORKSPACE_ROW_HEIGHT }}>
			<ContextMenu>
				<ContextMenu.Items>
					<Button label="Rename" onPress={handleRename} systemImage="pencil" />
					{/* biome-ignore lint/a11y/useValidAriaRole: SwiftUI button role, not ARIA */}
					<Button
						label="Delete"
						onPress={handleDelete}
						role="destructive"
						systemImage="trash"
					/>
				</ContextMenu.Items>
				<ContextMenu.Trigger>
					<RNHostView>
						<Pressable
							className="h-full flex-row items-center gap-3 px-4"
							onPress={onPress}
						>
							<OrganizationAvatar
								name={creator?.name ?? workspace.name}
								logo={creator?.image}
								size={36}
							/>
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
										· {relativeTime(workspace.updatedAt)}
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
					</RNHostView>
				</ContextMenu.Trigger>
			</ContextMenu>
		</Host>
	);
}
