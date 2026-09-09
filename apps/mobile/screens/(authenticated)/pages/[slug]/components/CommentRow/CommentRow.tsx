import { useLingui } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import { getInitials } from "@superset/shared/names";
import { Bot } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { ServerThread } from "../../hooks/usePageComments";

type Comment = ServerThread["comments"][number];

export function CommentRow({
	comment,
	onReply,
	indented = false,
}: {
	comment: Comment;
	onReply?: () => void;
	indented?: boolean;
}) {
	const { t } = useLingui();
	const isAgent = comment.authorKind === "agent";
	const name = comment.authorName ?? "";

	return (
		<View
			className={indented ? "flex-row gap-3 py-2 pl-11" : "flex-row gap-3 py-2"}
		>
			{indented ? null : (
				<View className="bg-muted size-8 shrink-0 items-center justify-center overflow-hidden rounded-full">
					{isAgent ? (
						<Icon as={Bot} className="text-muted-foreground size-4" />
					) : (
						<Text className="text-muted-foreground text-[11px] font-medium">
							{getInitials(name) || "?"}
						</Text>
					)}
				</View>
			)}

			<View className="min-w-0 flex-1 gap-0.5">
				<View className="flex-row items-baseline gap-1.5">
					<Text className="shrink text-[13px] font-semibold" numberOfLines={1}>
						{name}
					</Text>
					<Text className="text-muted-foreground text-xs">
						{formatDate(comment.createdAt)}
					</Text>
				</View>
				<Text className="text-[15px] leading-5">{comment.body}</Text>
				{onReply ? (
					<Pressable
						accessibilityRole="button"
						onPress={onReply}
						hitSlop={8}
						className="self-start pt-0.5 active:opacity-60"
					>
						<Text className="text-muted-foreground text-xs font-medium">
							{t({ message: "Reply" })}
						</Text>
					</Pressable>
				) : null}
			</View>
		</View>
	);
}
