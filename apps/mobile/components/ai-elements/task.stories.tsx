import type { Meta, StoryObj } from "@storybook/react-native";
import { FileCodeIcon } from "lucide-react-native";
import { View } from "react-native";
import {
	Task,
	TaskContent,
	TaskItem,
	TaskItemFile,
	TaskTrigger,
} from "@/components/ai-elements/task";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

const meta = {
	title: "ai-elements/Task",
	component: Task,
} satisfies Meta<typeof Task>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => (
		<View className="w-full">
			<Task>
				<TaskTrigger title="Searching for scroll handlers" />
				<TaskContent>
					<TaskItem>
						<Text>Reading</Text>
						<TaskItemFile>
							<Icon
								as={FileCodeIcon}
								className="size-3 text-muted-foreground"
							/>
							<Text>conversation.tsx</Text>
						</TaskItemFile>
					</TaskItem>
					<TaskItem>
						<Text>Scanning 12 matches for `onScroll`</Text>
					</TaskItem>
					<TaskItem>
						<Text>Found stick-to-bottom logic in</Text>
						<TaskItemFile>
							<Icon
								as={FileCodeIcon}
								className="size-3 text-muted-foreground"
							/>
							<Text>use-stick-to-bottom.ts</Text>
						</TaskItemFile>
					</TaskItem>
				</TaskContent>
			</Task>
		</View>
	),
};

export const Collapsed: Story = {
	render: () => (
		<View className="w-full">
			<Task defaultOpen={false}>
				<TaskTrigger title="Collapsed task" />
				<TaskContent>
					<TaskItem>
						<Text>Hidden until expanded</Text>
					</TaskItem>
				</TaskContent>
			</Task>
		</View>
	),
};
