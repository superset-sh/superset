import { useLingui } from "@lingui/react/macro";
import * as Haptics from "expo-haptics";
import { GripVertical, X } from "lucide-react-native";
import { memo } from "react";
import { Pressable, View } from "react-native";
import { useReorderableDrag } from "react-native-reorderable-list";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import type { TerminalRowData } from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import { AgentMark } from "@/screens/(authenticated)/(home)/new-session/agent";
import { PingDot } from "@/screens/(authenticated)/components/PingDot";
import { ATTENTION_COLORS } from "../../constants";

interface SessionRowProps {
	row: TerminalRowData;
	active: boolean;
	onSelect: (terminalId: string) => void;
	onClose: (row: TerminalRowData) => void;
}

/**
 * One session in the sheet: tap the row to switch to it, tap ✕ to close, and
 * reorder either by dragging the leading grip straight away or by holding
 * anywhere else on the row first.
 */
function SessionRowComponent({
	row,
	active,
	onSelect,
	onClose,
}: SessionRowProps) {
	const { t } = useLingui();
	const theme = useTheme();
	const drag = useReorderableDrag();
	const lift = () => {
		drag();
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
	};

	return (
		<View
			className={cn(
				"h-14 flex-row items-center rounded-xl pr-1",
				active ? "bg-secondary" : "bg-transparent",
			)}
		>
			<Pressable
				accessible
				accessibilityLabel={row.title}
				accessibilityRole="button"
				ph-label="session-row"
				className="h-full flex-1 flex-row items-center gap-2.5 pl-1.5 pr-3"
				onPress={() => onSelect(row.terminalId)}
				onLongPress={lift}
				delayLongPress={300}
			>
				{/* Two ways to pick up, because the row shares its axis with the
				    list's scroll: the grip lifts on touch, the rest of the row needs
				    the hold so a scroll flick still scrolls. */}
				<Pressable
					onPressIn={lift}
					hitSlop={10}
					className="items-center justify-center py-2 pr-1"
				>
					<GripVertical
						size={17}
						color={theme.mutedForeground}
						strokeWidth={2}
					/>
				</Pressable>
				<AgentMark
					agentId={row.agentId ?? ""}
					size={18}
					color={theme.mutedForeground}
				/>
				<Text className="flex-1 text-[15px]" numberOfLines={1}>
					{row.title}
				</Text>
				{row.attention === "review" ? (
					<View className="bg-green-500 size-2 rounded-full" />
				) : row.attention ? (
					<PingDot color={ATTENTION_COLORS[row.attention]} size={7} />
				) : null}
			</Pressable>
			{/* The ✕ sits outside the row pressable: nesting it would both merge
			    the row into one VoiceOver element and fire select on every close. */}
			<Pressable
				accessibilityLabel={t({
					message: `Close ${row.title}`,
				})}
				onPress={() => onClose(row)}
				hitSlop={8}
				className="size-9 items-center justify-center active:opacity-60"
			>
				<X size={17} color={theme.mutedForeground} strokeWidth={2} />
			</Pressable>
		</View>
	);
}

// Memoised: a reorder re-renders the list, and untouched rows should stay cheap.
export const SessionRow = memo(SessionRowComponent);
