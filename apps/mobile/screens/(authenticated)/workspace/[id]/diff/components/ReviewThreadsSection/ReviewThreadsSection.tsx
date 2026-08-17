import { formatDistanceToNowStrict } from "date-fns";
import { useRouter } from "expo-router";
import { ChevronDown, ChevronRight, MessageSquare } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, View } from "react-native";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { PullRequestConversationComment } from "@/lib/host-service/client";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import { useDiffViewStore } from "../../../stores/diffViewStore";
import type { WorkspaceReviewThreadsResult } from "../../hooks/useReviewThreads";
import { SectionLabel } from "../SectionLabel";
import { ReviewThreadCard } from "./components/ReviewThreadCard";
import { previewText } from "./utils/previewText";

function GroupHeader({
	label,
	count,
	open,
	onPress,
}: {
	label: string;
	count: number;
	open: boolean;
	onPress: () => void;
}) {
	return (
		<Pressable
			accessibilityLabel={`${open ? "Collapse" : "Expand"} ${label}`}
			className="flex-row items-center gap-1.5 px-4 pb-2 pt-3 active:opacity-70"
			onPress={onPress}
		>
			{/* Swapped, not rotated — a `rotate-90` class on the icon is a no-op here. */}
			<Icon
				as={open ? ChevronDown : ChevronRight}
				className="text-muted-foreground/70 size-3.5"
			/>
			<Text className="text-muted-foreground font-semibold text-[12px]">
				{label}
			</Text>
			<Text className="text-muted-foreground/70 text-[12px]">{count}</Text>
		</Pressable>
	);
}

function StateCard({
	title,
	body,
	pullRequestUrl,
}: {
	title: string;
	body: string;
	pullRequestUrl: string | null;
}) {
	return (
		<View className="bg-card border-border mx-4 rounded-xl border px-4 py-4">
			<Text className="font-semibold text-[15px]">{title}</Text>
			<Text className="text-muted-foreground mt-1 text-sm">{body}</Text>
			{pullRequestUrl ? (
				<PressableScale
					accessibilityLabel="Review on GitHub"
					className="mt-3 flex-row items-center gap-1"
					onPress={() => void Linking.openURL(pullRequestUrl)}
				>
					<Icon as={MessageSquare} className="text-primary size-3.5" />
					<Text className="text-primary font-semibold text-[13px]">
						Review on GitHub
					</Text>
				</PressableScale>
			) : null}
		</View>
	);
}

function ConversationCommentCard({
	comment,
}: {
	comment: PullRequestConversationComment;
}) {
	const age = Number.isNaN(new Date(comment.createdAt).getTime())
		? null
		: formatDistanceToNowStrict(new Date(comment.createdAt), {
				addSuffix: true,
			});
	return (
		<Pressable
			accessibilityLabel={`Comment by ${comment.user.login}`}
			className="bg-card border-border mx-4 mb-2 flex-row gap-2.5 rounded-xl border px-3.5 py-3 active:opacity-70"
			disabled={!comment.htmlUrl}
			onPress={() => void Linking.openURL(comment.htmlUrl)}
		>
			<Avatar alt={comment.user.login} className="mt-0.5 size-6">
				{comment.user.avatarUrl ? (
					<AvatarImage source={{ uri: comment.user.avatarUrl }} />
				) : null}
				<AvatarFallback>
					<Text className="font-semibold text-[10px]">
						{comment.user.login.slice(0, 2).toUpperCase()}
					</Text>
				</AvatarFallback>
			</Avatar>
			<View className="min-w-0 flex-1">
				<View className="flex-row items-center gap-2">
					<Text className="font-semibold text-[13px]" numberOfLines={1}>
						{comment.user.login}
					</Text>
					{age ? (
						<Text className="text-muted-foreground text-[11.5px]">{age}</Text>
					) : null}
				</View>
				<Text
					className="text-muted-foreground mt-0.5 text-[13.5px] leading-[19px]"
					numberOfLines={4}
				>
					{previewText(comment.body)}
				</Text>
			</View>
		</Pressable>
	);
}

/**
 * The PR's review threads — reviewer comments that came back from GitHub,
 * resolvable in place. The mirror image of the draft comments the diff screens
 * compose (`stores/draftCommentsStore`), which travel outward to an agent.
 */
export function ReviewThreadsSection({
	workspaceId,
	threads,
	pullRequestUrl,
}: {
	workspaceId: string | null;
	threads: WorkspaceReviewThreadsResult;
	pullRequestUrl: string | null;
}) {
	const router = useRouter();
	const requestJump = useDiffViewStore((state) => state.requestJump);
	const [resolvedOpen, setResolvedOpen] = useState(false);
	const [conversationOpen, setConversationOpen] = useState(false);

	const { unresolved, resolved, conversation } = threads;
	const isEmpty =
		unresolved.length === 0 &&
		resolved.length === 0 &&
		conversation.length === 0;

	const openInDiff = (path: string) => {
		if (!workspaceId) return;
		requestJump(path);
		router.push(`/(authenticated)/workspace/${workspaceId}/files-changed`);
	};

	return (
		<>
			<SectionLabel>Review comments</SectionLabel>
			{threads.isHostOffline ? (
				<StateCard
					body="Reconnect this workspace's host to load and resolve review comments here."
					pullRequestUrl={pullRequestUrl}
					title="Host is offline"
				/>
			) : threads.isLoading ? (
				<View className="bg-card border-border mx-4 flex-row items-center gap-3 rounded-xl border px-4 py-4">
					<ActivityIndicator size="small" />
					<Text className="text-muted-foreground text-sm">
						Loading review comments…
					</Text>
				</View>
			) : threads.isError ? (
				<StateCard
					body="The host couldn't reach GitHub. Pull to refresh, or pick it up on GitHub."
					pullRequestUrl={pullRequestUrl}
					title="Couldn't load review comments"
				/>
			) : isEmpty ? (
				<StateCard
					body="Comments reviewers leave on this PR show up here, ready to resolve."
					pullRequestUrl={pullRequestUrl}
					title="No review comments"
				/>
			) : (
				<>
					{unresolved.map((thread) => (
						<ReviewThreadCard
							isPending={threads.pendingThreadIds.has(thread.id)}
							key={thread.id}
							onOpenInDiff={() => openInDiff(thread.path)}
							onToggleResolved={() => threads.setResolved(thread.id, true)}
							thread={thread}
						/>
					))}
					{unresolved.length === 0 ? (
						resolved.length > 0 ? (
							<StateCard
								body="Every review thread on this PR is resolved."
								pullRequestUrl={null}
								title="Nothing left to resolve"
							/>
						) : (
							<StateCard
								body="Comments reviewers leave on this PR show up here, ready to resolve."
								pullRequestUrl={pullRequestUrl}
								title="No review comments"
							/>
						)
					) : null}
					{resolved.length > 0 ? (
						<>
							<GroupHeader
								count={resolved.length}
								label="Resolved"
								onPress={() => setResolvedOpen((current) => !current)}
								open={resolvedOpen}
							/>
							{resolvedOpen
								? resolved.map((thread) => (
										<ReviewThreadCard
											isPending={threads.pendingThreadIds.has(thread.id)}
											key={thread.id}
											onOpenInDiff={() => openInDiff(thread.path)}
											onToggleResolved={() =>
												threads.setResolved(thread.id, false)
											}
											thread={thread}
										/>
									))
								: null}
						</>
					) : null}
					{conversation.length > 0 ? (
						<>
							<GroupHeader
								count={conversation.length}
								label="Conversation"
								onPress={() => setConversationOpen((current) => !current)}
								open={conversationOpen}
							/>
							{conversationOpen
								? conversation.map((comment) => (
										<ConversationCommentCard
											comment={comment}
											key={comment.id}
										/>
									))
								: null}
						</>
					) : null}
				</>
			)}
		</>
	);
}
