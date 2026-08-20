import type { SelectGithubPullRequest } from "@superset/db/schema";
import { useRouter } from "expo-router";
import { FolderGit2, Plus } from "lucide-react-native";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { CloudWorkspaceStatus } from "@/hooks/useCloudWorkspaceItems";
import type {
	HostWorkspaceItem,
	HostWorkspacesCacheOps,
} from "@/hooks/useHostWorkspaces";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { AgentMark } from "@/screens/(authenticated)/(home)/new-session/agent";
import { AsciiSpinner } from "@/screens/(authenticated)/components/AsciiSpinner";
import { PingDot } from "@/screens/(authenticated)/components/PingDot";
import {
	PULL_REQUEST_STATUS,
	pullRequestStatus,
} from "@/screens/(authenticated)/workspace/[id]/utils/pullRequest";
import type {
	TerminalAttention,
	TerminalRowData,
} from "../../hooks/useHostTerminals";
import type { DiffStats } from "../../hooks/useVisibleDiffStats";
import { useChatTargetStore } from "../../stores/chatTargetStore";
import { WorkspaceRowMenu } from "./components/WorkspaceRowMenu";
import { useWorkspaceRowActions } from "./hooks/useWorkspaceRowActions";

// PR state replaces the host icon in the icon slot — same treatment as
// desktop's DashboardSidebarWorkspaceIcon.
const MAX_SESSION_MARKS = 3;

export function WorkspaceRow({
	workspace,
	pullRequest,
	diffStats,
	cache,
	attention,
	sessions,
	cloudStatus,
}: {
	workspace: HostWorkspaceItem;
	pullRequest?: SelectGithubPullRequest;
	diffStats: DiffStats | null;
	cache: HostWorkspacesCacheOps;
	attention?: TerminalAttention | null;
	sessions: TerminalRowData[];
	/** Set for a cloud workspace; drives the row's pending/failed treatment. */
	cloudStatus?: CloudWorkspaceStatus;
}) {
	const router = useRouter();
	const theme = useTheme();
	const prIcon = pullRequest
		? PULL_REQUEST_STATUS[pullRequestStatus(pullRequest)]
		: null;
	const setTarget = useChatTargetStore((state) => state.setTarget);
	const targeted = useChatTargetStore(
		(state) => state.target?.workspaceId === workspace.id,
	);
	const canChat =
		workspace.hostReachable &&
		workspace.worktreeExists !== false &&
		(cloudStatus === undefined || cloudStatus === "ready");
	const {
		isDeleting,
		renameWorkspace,
		deleteWorkspace,
		copyId,
		shareWorkspace,
	} = useWorkspaceRowActions(workspace, cache, cloudStatus);

	return (
		<WorkspaceRowMenu
			// A sandbox that doesn't exist yet has nothing to rename or delete; a
			// failed one only needs disposing of. Cloud rows are served as `main`
			// because the checkout is the repo, but deleting one kills the
			// sandbox, not a base checkout.
			canRename={cloudStatus === undefined || cloudStatus === "ready"}
			canDelete={
				cloudStatus === undefined
					? workspace.type !== "main"
					: cloudStatus !== "provisioning"
			}
			onRename={() => void renameWorkspace()}
			onDelete={deleteWorkspace}
			onCopyId={copyId}
			onShare={shareWorkspace}
		>
			{/* Default press behavior on purpose: the system context-menu lift
			    owns the hold animation, and custom press feedback fights it. */}
			<Pressable
				className={cn(
					"flex-row items-center gap-3 rounded-xl py-2 pl-10 pr-3",
					targeted ? "bg-foreground/5" : "bg-background",
					isDeleting && "opacity-40",
				)}
				disabled={isDeleting}
				onPress={() =>
					router.push(`/(authenticated)/workspace/${workspace.id}`)
				}
			>
				{/* Desktop WorkspaceIcon semantics: working replaces the icon with
				    the braille spinner; other statuses overlay a corner ping on the
				    base icon (PR state when one exists, else the workspace mark).
				    A delete in flight takes the slot over everything else. */}
				{isDeleting ? (
					<View className="size-6 items-center justify-center">
						<ActivityIndicator size="small" color={theme.mutedForeground} />
					</View>
				) : attention === "working" || cloudStatus === "provisioning" ? (
					<View className="size-6 items-center justify-center">
						<AsciiSpinner />
					</View>
				) : (
					<View className="size-6 items-center justify-center">
						{prIcon && pullRequest ? (
							<Button
								accessibilityLabel={`Pull request #${pullRequest.prNumber}`}
								variant="ghost"
								size="icon"
								className="size-6"
								hitSlop={8}
								onPress={() =>
									router.push(
										`/(authenticated)/workspace/${workspace.id}/pull-request/${pullRequest.prNumber}`,
									)
								}
							>
								<Icon
									as={prIcon.icon}
									className={`size-5 ${prIcon.ink}`}
									strokeWidth={1.75}
								/>
							</Button>
						) : (
							<Icon
								as={FolderGit2}
								className="text-muted-foreground/80 size-4.5"
								strokeWidth={1.75}
							/>
						)}
						{attention === "permission" ? (
							<View className="absolute -right-0.5 -top-0.5">
								<PingDot color="#eab308" size={7} />
							</View>
						) : attention === "failed" || cloudStatus === "failed" ? (
							<View className="absolute -right-0.5 -top-0.5">
								<PingDot color="#ef4444" size={7} />
							</View>
						) : attention === "review" ? (
							<View className="bg-green-500 absolute -right-0.5 -top-0.5 size-2 rounded-full" />
						) : null}
					</View>
				)}
				<View className="flex-1">
					<Text className="font-medium text-[15px]" numberOfLines={1}>
						{workspace.name}
					</Text>
					<View className="flex-row items-center gap-1">
						{/* A workspace named after its branch says it twice otherwise —
						    common now that every project shows its `main`. */}
						{workspace.branch === workspace.name ? null : (
							<Text
								className="text-muted-foreground shrink text-xs"
								numberOfLines={1}
							>
								{workspace.branch}
							</Text>
						)}
						{diffStats &&
						(diffStats.additions > 0 || diffStats.deletions > 0) ? (
							<>
								{workspace.branch === workspace.name ? null : (
									<Text className="text-muted-foreground text-xs">•</Text>
								)}
								<Text className="text-muted-foreground font-mono text-xs">
									+{diffStats.additions} −{diffStats.deletions}
								</Text>
							</>
						) : null}
					</View>
				</View>
				{sessions.length > 0 ? (
					// Overlapping avatar-style stack — stays ~fixed-width as sessions
					// grow instead of eating the row.
					<View className="flex-row items-center">
						{sessions.slice(0, MAX_SESSION_MARKS).map((session, index) => (
							<View
								key={session.terminalId}
								className={cn(
									"bg-secondary size-6 items-center justify-center rounded-full",
									index > 0 && "-ml-2",
								)}
							>
								<AgentMark
									agentId={session.agentId ?? ""}
									size={12}
									color={theme.mutedForeground}
								/>
							</View>
						))}
						{sessions.length > MAX_SESSION_MARKS ? (
							<Text className="text-muted-foreground pl-1 text-[11px]">
								+{sessions.length - MAX_SESSION_MARKS}
							</Text>
						) : null}
					</View>
				) : null}
				<Button
					accessibilityLabel={`New agent in ${workspace.name}`}
					variant="ghost"
					size="icon"
					disabled={!canChat || isDeleting}
					onPress={() =>
						setTarget({
							workspaceId: workspace.id,
							workspaceName: workspace.name,
							branch: workspace.branch,
							hostId: workspace.hostId,
						})
					}
				>
					<Icon as={Plus} className="text-muted-foreground size-5" />
				</Button>
			</Pressable>
		</WorkspaceRowMenu>
	);
}
