import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import type { DraftComment } from "../../../stores/draftCommentsStore";

export function CommentCardRow({
	comment,
	stale,
	orphaned,
	onLongPress,
}: {
	comment: DraftComment;
	stale: boolean;
	/** True when the anchored line/file no longer exists in the changeset. */
	orphaned?: boolean;
	onLongPress: (comment: DraftComment) => void;
}) {
	return (
		<PressableScale
			className="bg-card border-border mx-3 my-1.5 ml-12 rounded-xl border px-3 py-2.5"
			onLongPress={() => onLongPress(comment)}
			onPress={() => onLongPress(comment)}
		>
			<View className="flex-row items-center gap-2">
				<Text className="text-muted-foreground text-[11px]">
					Draft{comment.line > 0 ? ` · line ${comment.line}` : " · file"}
					{orphaned ? ` · ${comment.path}` : ""}
				</Text>
				{stale ? (
					<View className="bg-amber-500/15 rounded-full px-2 py-0.5">
						<Text className="text-amber-500 text-[10px] font-semibold">
							line changed
						</Text>
					</View>
				) : null}
			</View>
			<Text className="mt-0.5 text-[13.5px]">{comment.body}</Text>
		</PressableScale>
	);
}
