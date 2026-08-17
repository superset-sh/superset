import { formatDistanceToNowStrict } from "date-fns";
import { ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { MessageResponse } from "@/components/ai-elements/message";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { PullRequestReviewThread } from "@/lib/host-service/client";
import { cn } from "@/lib/utils";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import { previewText } from "../../utils/previewText";
import { readableBody } from "./utils/readableBody";

type ThreadComment = PullRequestReviewThread["comments"][number];

function relativeTime(isoDate: string): string | null {
	const ms = new Date(isoDate).getTime();
	if (Number.isNaN(ms)) return null;
	return formatDistanceToNowStrict(new Date(ms), { addSuffix: true });
}

function anchorLabel(thread: PullRequestReviewThread): string {
	const path = thread.path || "Pull request";
	const name = path.split("/").pop() ?? path;
	return thread.line != null ? `${name}:${thread.line}` : name;
}

function Badge({ label }: { label: string }) {
	return (
		<View className="border-border rounded-full border px-2 py-0.5">
			<Text className="text-muted-foreground font-semibold text-[10px] uppercase tracking-wide">
				{label}
			</Text>
		</View>
	);
}

function CommentBody({
	comment,
	expanded,
}: {
	comment: ThreadComment;
	expanded: boolean;
}) {
	const age = relativeTime(comment.createdAt);
	return (
		<View className="flex-row gap-2.5">
			<Avatar alt={comment.author.login} className="mt-0.5 size-6">
				{comment.author.avatarUrl ? (
					<AvatarImage source={{ uri: comment.author.avatarUrl }} />
				) : null}
				<AvatarFallback>
					<Text className="font-semibold text-[10px]">
						{comment.author.login.slice(0, 2).toUpperCase()}
					</Text>
				</AvatarFallback>
			</Avatar>
			<View className="min-w-0 flex-1">
				<View className="flex-row items-center gap-2">
					<Text className="font-semibold text-[13px]" numberOfLines={1}>
						{comment.author.login}
					</Text>
					{age ? (
						<Text className="text-muted-foreground text-[11.5px]">{age}</Text>
					) : null}
				</View>
				{expanded ? (
					// Bodies are GitHub markdown — review bots ship tables, code and
					// <details> blocks that are unreadable raw.
					<MessageResponse>{readableBody(comment.body)}</MessageResponse>
				) : (
					<Text
						className="text-muted-foreground mt-0.5 text-[13.5px] leading-[19px]"
						numberOfLines={3}
					>
						{previewText(comment.body)}
					</Text>
				)}
			</View>
		</View>
	);
}

export function ReviewThreadCard({
	thread,
	isPending,
	onToggleResolved,
	onOpenInDiff,
}: {
	thread: PullRequestReviewThread;
	isPending: boolean;
	onToggleResolved: () => void;
	onOpenInDiff?: () => void;
}) {
	// Collapsed by default whatever the state: a review-bot comment is a page of
	// markdown, and a list of them is only scannable clamped.
	const [expanded, setExpanded] = useState(false);
	const first = thread.comments[0];
	if (!first) return null;
	const replies = thread.comments.slice(1);

	return (
		<View
			className={cn(
				"bg-card border-border mx-4 mb-2 overflow-hidden rounded-xl border",
				thread.isResolved && "opacity-60",
			)}
		>
			<Pressable
				accessibilityLabel={`Review comment by ${first.author.login} on ${anchorLabel(thread)}`}
				className="gap-2 px-3.5 py-3 active:opacity-70"
				onPress={() => setExpanded((current) => !current)}
			>
				<View className="flex-row items-center gap-2">
					<Text
						className="text-muted-foreground min-w-0 flex-1 font-mono text-[11.5px]"
						numberOfLines={1}
					>
						{anchorLabel(thread)}
					</Text>
					{thread.isOutdated ? <Badge label="Outdated" /> : null}
					{thread.isResolved ? <Badge label="Resolved" /> : null}
				</View>
				<CommentBody comment={first} expanded={expanded} />
				{expanded ? (
					replies.map((reply) => (
						<View className="border-border/60 border-t pt-2" key={reply.id}>
							<CommentBody comment={reply} expanded />
						</View>
					))
				) : replies.length > 0 ? (
					<Text className="text-muted-foreground/70 pl-[34px] text-[12px]">
						{replies.length === 1 ? "1 reply" : `${replies.length} replies`}
					</Text>
				) : null}
			</Pressable>
			<View className="border-border/60 flex-row items-center gap-2 border-t px-3.5 py-2.5">
				{onOpenInDiff && thread.path ? (
					<PressableScale
						accessibilityLabel={`Open ${anchorLabel(thread)} in diff`}
						className="flex-row items-center gap-1"
						onPress={onOpenInDiff}
					>
						<Text className="text-muted-foreground text-[13px]">
							Open in diff
						</Text>
						<Icon
							as={ChevronRight}
							className="text-muted-foreground/60 size-3.5"
						/>
					</PressableScale>
				) : null}
				<View className="flex-1" />
				<PressableScale
					accessibilityLabel={`${thread.isResolved ? "Unresolve" : "Resolve"} thread on ${anchorLabel(thread)}`}
					className={cn(
						"flex-row items-center gap-1.5 rounded-full border px-3 py-1.5",
						thread.isResolved ? "border-border" : "bg-primary border-primary",
					)}
					disabled={isPending}
					onPress={onToggleResolved}
				>
					{isPending ? <ActivityIndicator size="small" /> : null}
					<Text
						className={cn(
							"font-semibold text-[13px]",
							!thread.isResolved && "text-primary-foreground",
						)}
					>
						{thread.isResolved ? "Unresolve" : "Resolve"}
					</Text>
				</PressableScale>
			</View>
		</View>
	);
}
