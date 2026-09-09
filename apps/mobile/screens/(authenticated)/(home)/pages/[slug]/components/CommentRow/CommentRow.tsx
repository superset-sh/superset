import { formatDate } from "@superset/i18n/format";
import { getInitials } from "@superset/shared/names";
import { Bot } from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { ServerThread } from "../../hooks/usePageComments";

type Comment = ServerThread["comments"][number];

export function CommentRow({ comment }: { comment: Comment }) {
	const isAgent = comment.authorKind === "agent";
	const name = comment.authorName ?? "";

	return (
		<View className="flex-row gap-2 px-3 py-1.5">
			<View className="bg-muted size-6 shrink-0 items-center justify-center rounded-full">
				{isAgent ? (
					<Icon as={Bot} className="text-muted-foreground size-3" />
				) : (
					<Text className="text-muted-foreground text-[10px] font-medium">
						{getInitials(name) || "?"}
					</Text>
				)}
			</View>

			<View className="min-w-0 flex-1 gap-0.5">
				<View className="flex-row items-baseline gap-2">
					<Text className="shrink text-sm font-medium" numberOfLines={1}>
						{name}
					</Text>
					<Text className="text-muted-foreground text-xs">
						{formatDate(comment.createdAt)}
					</Text>
				</View>
				<Text className="text-[15px]">{comment.body}</Text>
			</View>
		</View>
	);
}
