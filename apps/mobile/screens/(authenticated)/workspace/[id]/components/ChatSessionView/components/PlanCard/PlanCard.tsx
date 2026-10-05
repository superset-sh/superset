import { Trans } from "@lingui/react/macro";
import type { Plan } from "@superset/chat/protocol";
import { Circle, CircleCheck, CircleDot } from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

const ICON_BY_STATUS = {
	pending: Circle,
	in_progress: CircleDot,
	completed: CircleCheck,
} as const;

export function PlanCard({ plan }: { plan: Plan }) {
	return (
		<View className="border-border gap-1.5 rounded-lg border p-3">
			<Text className="text-foreground text-xs font-medium">
				<Trans>Plan</Trans>
			</Text>
			{plan.entries.map((entry, index) => (
				<View
					className="flex-row items-start gap-2"
					key={`${index}:${entry.text}`}
				>
					<Icon
						as={ICON_BY_STATUS[entry.status]}
						className="text-muted-foreground mt-0.5 size-3"
					/>
					<Text
						className={
							entry.status === "completed"
								? "text-muted-foreground min-w-0 flex-1 text-xs line-through"
								: "text-foreground min-w-0 flex-1 text-xs"
						}
					>
						{entry.text}
					</Text>
				</View>
			))}
		</View>
	);
}
