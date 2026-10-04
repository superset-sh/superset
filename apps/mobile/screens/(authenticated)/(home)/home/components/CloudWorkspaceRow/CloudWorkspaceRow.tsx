import { useLingui } from "@lingui/react/macro";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { CloudWorkspaceRow as CloudWorkspaceRowData } from "@/hooks/useCloudWorkspaces";
import type { HostWorkspacesCacheOps } from "@/hooks/useHostWorkspaces";
import { cn } from "@/lib/utils";
import { ProjectAvatar } from "@/screens/(authenticated)/(home)/filter/components/ProjectAvatar";
import { UserAvatar } from "@/screens/(authenticated)/settings/components/UserAvatar";
import { useUnreadWorkspacesStore } from "@/screens/(authenticated)/stores/unreadWorkspacesStore";
import {
	PULL_REQUEST_STATUS,
	pullRequestStatus,
} from "@/screens/(authenticated)/workspace/[id]/utils/pullRequest";
import type { CloudPullRequest } from "../../hooks/useCloudPullRequests";
import { ArchivedCloudRowMenu } from "./components/ArchivedCloudRowMenu";
import { CloudWorkspaceRowMenu } from "./components/CloudWorkspaceRowMenu";
import { CloudWorkspaceStatus } from "./components/CloudWorkspaceStatus";

/** Desktop's DashboardSidebarCloudRow: repo, name, owner if not you, PR, status. */
export function CloudWorkspaceRow({
	row,
	repoFullName,
	pullRequest,
	viewerId,
	now,
	cache,
	onCopied,
}: {
	row: CloudWorkspaceRowData;
	repoFullName?: string;
	pullRequest?: CloudPullRequest;
	viewerId: string | null;
	now: Date;
	cache: HostWorkspacesCacheOps;
	onCopied: () => void;
}) {
	const { t } = useLingui();
	const router = useRouter();
	const archived = row.status === "archived";
	const readAt = useUnreadWorkspacesStore((state) => state.cloudReadAt[row.id]);
	const manuallyUnread = useUnreadWorkspacesStore(
		(state) => row.id in state.manualUnread,
	);
	const setManualUnread = useUnreadWorkspacesStore(
		(state) => state.setManualUnread,
	);
	const clearManualUnread = useUnreadWorkspacesStore(
		(state) => state.clearManualUnread,
	);
	const markCloudRead = useUnreadWorkspacesStore(
		(state) => state.markCloudRead,
	);
	const isRead =
		!manuallyUnread &&
		(row.agentStatusAt === null ||
			(readAt ?? 0) >= row.agentStatusAt.getTime());
	const isUnread = manuallyUnread || (row.agentStatus === "review" && !isRead);
	const toggleUnread = () => {
		if (!isUnread) {
			setManualUnread(row.id);
			return;
		}
		clearManualUnread(row.id);
		if (row.agentStatusAt) markCloudRead(row.id, row.agentStatusAt.getTime());
	};
	const owner = row.createdBy;
	const isMine = owner !== null && owner.userId === viewerId;
	const [repoOwner, repoName] = repoFullName?.split("/") ?? [];
	const prStatus = pullRequest
		? PULL_REQUEST_STATUS[pullRequestStatus({ ...pullRequest, mergedAt: null })]
		: null;

	const body = (
		<Pressable
			className="bg-background flex-row items-center gap-3 rounded-xl py-2 pl-4 pr-3"
			onPress={() => router.push(`/(authenticated)/workspace/${row.id}`)}
			ph-label="cloud-workspace-row"
		>
			<ProjectAvatar
				name={repoName ?? row.name}
				iconUrl={
					repoOwner ? `https://github.com/${repoOwner}.png?size=64` : null
				}
				size={20}
			/>
			<View className="min-w-0 flex-1 flex-row items-center gap-1.5">
				<Text
					className={cn(
						"shrink font-medium text-[15px]",
						archived && "text-muted-foreground",
					)}
					numberOfLines={1}
				>
					{row.name || t({ message: "Untitled workspace" })}
				</Text>
				{owner && !isMine ? (
					<UserAvatar
						name={owner.name}
						image={owner.image}
						className="size-[18px]"
						textClassName="text-[7px]"
					/>
				) : null}
			</View>
			{pullRequest && prStatus && !archived ? (
				<Button
					accessibilityLabel={t({
						message: `Pull request #${pullRequest.number}`,
					})}
					ph-label="cloud-workspace-row-pull-request"
					variant="ghost"
					size="icon"
					className="-my-1 size-7 rounded-md"
					hitSlop={8}
					onPress={() =>
						router.push(
							`/(authenticated)/workspace/${row.id}/pull-request/${pullRequest.number}?owner=${encodeURIComponent(repoOwner ?? "")}&repo=${encodeURIComponent(repoName ?? "")}`,
						)
					}
				>
					<Icon
						as={prStatus.icon}
						className={cn("size-4", prStatus.ink)}
						strokeWidth={1.75}
					/>
				</Button>
			) : null}
			<View className="min-w-6 items-end">
				<CloudWorkspaceStatus row={row} isUnread={isUnread} now={now} />
			</View>
		</Pressable>
	);

	return archived ? (
		<ArchivedCloudRowMenu row={row} cache={cache} onCopied={onCopied}>
			{body}
		</ArchivedCloudRowMenu>
	) : (
		<CloudWorkspaceRowMenu
			row={row}
			cache={cache}
			isUnread={isUnread}
			onToggleUnread={toggleUnread}
			onCopied={onCopied}
		>
			{body}
		</CloudWorkspaceRowMenu>
	);
}
