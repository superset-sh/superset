import { Terminal } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { AgentLogo } from "@/screens/(authenticated)/components/AgentLogo";
import { compactTime } from "@/screens/(authenticated)/utils/compactTime";
import type { SessionRowData } from "@/screens/(authenticated)/utils/sessionRows";
import { SessionRowMenu } from "./components/SessionRowMenu";
import { StatusDot } from "./components/StatusDot";

// Chat sessions carry no agent/model column yet; they all run through the
// superset agent on Claude models, hence the fixed logo.
const CHAT_AGENT_ID = "claude";

/**
 * One session row in the desktop activity-strip language: agent logo in a
 * muted circle chip, StatusIndicator corner dot as the only status signal.
 * Chat rows navigate to the thread; terminal rows are read-only and marked
 * with a small tty glyph.
 */
export function SessionRow({
	row,
	onPress,
	className,
}: {
	row: SessionRowData;
	onPress?: () => void;
	className?: string;
}) {
	const content = (
		<>
			<View className="size-[22px] items-center justify-center">
				<AgentLogo
					agentId={row.kind === "chat" ? CHAT_AGENT_ID : row.agentId}
					size={15}
				/>
				{row.kind === "terminal" && <StatusDot status={row.status} />}
			</View>
			<View className="flex-1 flex-row items-center gap-1.5">
				<Text
					className="text-foreground/80 flex-shrink text-[13px]"
					numberOfLines={1}
				>
					{row.kind === "chat" ? row.title : row.label}
				</Text>
				{row.kind === "terminal" && (
					<Icon
						as={Terminal}
						className="text-muted-foreground size-[11px]"
						strokeWidth={2}
					/>
				)}
			</View>
			<Text className="text-muted-foreground text-[11px]">
				{compactTime(row.ts)}
			</Text>
		</>
	);

	const rowClassName = cn("flex-row items-center gap-2.5 px-4 py-2", className);

	if (row.kind === "chat" && onPress) {
		return (
			<SessionRowMenu sessionId={row.id} title={row.title}>
				<Pressable
					className={cn(rowClassName, "active:bg-accent")}
					onPress={onPress}
				>
					{content}
				</Pressable>
			</SessionRowMenu>
		);
	}
	return <View className={rowClassName}>{content}</View>;
}
