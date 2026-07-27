import type { TimelinePlanItem } from "@superset/host-service-sync/timeline";
import { View } from "react-native";
import { Text } from "@/components/ui/text";

const STATUS_MARK: Record<string, string> = {
	pending: "○",
	inProgress: "◐",
	completed: "●",
};

export function PlanItemView({ item }: { item: TimelinePlanItem }) {
	if (item.removed || item.entries.length === 0) return null;

	return (
		<View className="border-border w-full rounded-lg border p-3">
			<Text className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
				Plan
			</Text>
			{item.entries.map((entry, index) => (
				<View
					key={`${item.id}:${String(index)}`}
					className="flex-row items-start gap-2 py-0.5"
				>
					<Text className="text-muted-foreground text-sm">
						{STATUS_MARK[entry.status] ?? "○"}
					</Text>
					<Text
						className={
							entry.status === "completed"
								? "text-muted-foreground flex-1 text-sm line-through"
								: "flex-1 text-sm"
						}
					>
						{entry.content}
					</Text>
				</View>
			))}
		</View>
	);
}
