import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { ClaudeLogo } from "@/screens/(authenticated)/(home)/components/ClaudeLogo";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import type { SessionRowData } from "../../utils/sessionRows";
import { SessionRowMenu } from "./components/SessionRowMenu";
import { compactTime } from "./utils/compactTime";

// Chat sessions carry no agent/model column yet; they all run through the
// superset agent on Claude models, hence the fixed logo.
export function SessionRow({
	row,
	onPress,
	className,
}: {
	row: SessionRowData;
	onPress: () => void;
	className?: string;
}) {
	return (
		<SessionRowMenu sessionId={row.id} title={row.title}>
			<PressableScale
				className={cn("flex-row items-center gap-3 px-1 py-3.5", className)}
				onPress={onPress}
			>
				<View className="size-6 items-center justify-center">
					<ClaudeLogo size={16} />
				</View>
				<Text
					className="text-foreground/90 flex-1 text-[15px]"
					numberOfLines={1}
				>
					{row.title}
				</Text>
				<Text className="text-muted-foreground text-xs">
					{compactTime(row.ts)}
				</Text>
			</PressableScale>
		</SessionRowMenu>
	);
}
