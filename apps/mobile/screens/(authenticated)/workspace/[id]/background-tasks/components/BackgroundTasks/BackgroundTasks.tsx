import { Trans } from "@lingui/react/macro";
import type { BackgroundTask } from "@superset/chat/protocol";
import { Bot, SquareTerminal } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

interface BackgroundTasksProps {
	tasks: BackgroundTask[];
	onStop: (taskId: string) => void;
}

export function BackgroundTasks({ tasks, onStop }: BackgroundTasksProps) {
	return (
		<View className="gap-1">
			{tasks.map((task) => (
				<View className="flex-row items-center gap-3 py-2.5" key={task.id}>
					<Icon
						as={task.kind === "subagent" ? Bot : SquareTerminal}
						className="text-muted-foreground size-4"
					/>
					<View className="min-w-0 flex-1">
						<Text className="text-foreground text-[15px]" numberOfLines={1}>
							{task.name}
						</Text>
						{task.detail ? (
							<Text
								className="text-muted-foreground text-[13px]"
								numberOfLines={1}
							>
								{task.detail}
							</Text>
						) : null}
					</View>
					{task.canStop ? (
						<Pressable
							accessibilityRole="button"
							className="rounded-full bg-white/10 px-3 py-1.5 active:opacity-70"
							onPress={() => onStop(task.id)}
						>
							<Text className="text-foreground text-[13px] font-medium">
								<Trans>Stop</Trans>
							</Text>
						</Pressable>
					) : null}
				</View>
			))}
		</View>
	);
}
