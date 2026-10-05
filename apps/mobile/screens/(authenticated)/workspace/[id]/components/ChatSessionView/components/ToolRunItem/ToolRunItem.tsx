import { Plural } from "@lingui/react/macro";
import type { ToolCall } from "@superset/chat/protocol";
import { ListChecks } from "lucide-react-native";
import { View } from "react-native";
import { ToolCallRow } from "@/components/ai-elements/tool-call-row";
import { Text } from "@/components/ui/text";
import { ToolCallItem } from "../ToolCallItem";

export function ToolRunItem({ items }: { items: ToolCall[] }) {
	const count = items.length;
	return (
		<ToolCallRow
			icon={ListChecks}
			isError={items.some((item) => item.status === "failed")}
			title={
				<Text className="text-muted-foreground text-xs">
					<Plural value={count} one="# step" other="# steps" />
				</Text>
			}
		>
			<View className="gap-0.5 pl-2">
				{items.map((item) => (
					<ToolCallItem item={item} key={item.id} />
				))}
			</View>
		</ToolCallRow>
	);
}
