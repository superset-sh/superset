import { Plural, useLingui } from "@lingui/react/macro";
import type { ToolCall } from "@superset/chat/protocol";
import { Pressable } from "react-native";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Text } from "@/components/ui/text";
import {
	activityStepCount,
	type ChatRow,
	isActivityLive,
} from "../../../../utils/chatRows";

function lastToolTitle(rows: readonly ChatRow[]): string | null {
	for (let index = rows.length - 1; index >= 0; index -= 1) {
		const row = rows[index];
		if (row?.kind === "tool_run") {
			const item = row.items.at(-1);
			if (item) return item.title || item.toolName;
		}
		if (row?.kind === "item" && row.item.kind === "tool_call") {
			const item = row.item as ToolCall;
			return item.title || item.toolName;
		}
	}
	return null;
}

export function ActivityRow({
	rows,
	onPress,
}: {
	rows: ChatRow[];
	onPress: () => void;
}) {
	const { t } = useLingui();
	const count = activityStepCount(rows);
	const live = isActivityLive(rows);
	const preview = lastToolTitle(rows);
	return (
		<Pressable
			accessibilityRole="button"
			className="w-full flex-row items-center gap-1.5 py-0.5 active:opacity-60"
			hitSlop={6}
			onPress={onPress}
		>
			{live ? (
				<Shimmer className="text-[17px]">{t({ message: "Working…" })}</Shimmer>
			) : (
				<Text className="text-muted-foreground text-[17px]">
					<Plural value={count} one="# step" other="# steps" />
				</Text>
			)}
			{preview ? (
				<Text
					className="text-muted-foreground/60 min-w-0 shrink text-[17px]"
					numberOfLines={1}
				>
					{preview}
				</Text>
			) : null}
		</Pressable>
	);
}
