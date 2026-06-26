import type { Meta, StoryObj } from "@storybook/react-native";
import { ListTodoIcon, XIcon } from "lucide-react-native";
import { View } from "react-native";
import {
	Queue,
	QueueItem,
	QueueItemAction,
	QueueItemActions,
	QueueItemAttachment,
	QueueItemContent,
	QueueItemDescription,
	QueueItemFile,
	QueueItemIndicator,
	QueueList,
	QueueSection,
	QueueSectionContent,
	QueueSectionLabel,
	QueueSectionTrigger,
} from "@/components/ai-elements/queue";
import { Icon } from "@/components/ui/icon";

const meta = {
	title: "ai-elements/Queue",
	component: Queue,
} satisfies Meta<typeof Queue>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => (
		<View className="w-full">
			<Queue>
				<QueueSection>
					<QueueSectionTrigger>
						<QueueSectionLabel
							count={3}
							icon={
								<Icon
									as={ListTodoIcon}
									className="size-4 text-muted-foreground"
								/>
							}
							label="queued messages"
						/>
					</QueueSectionTrigger>
					<QueueSectionContent>
						<QueueList>
							<QueueItem>
								<View className="flex-row items-start gap-2">
									<QueueItemIndicator />
									<QueueItemContent>
										Fix the streaming scroll jump
									</QueueItemContent>
									<QueueItemActions>
										<QueueItemAction accessibilityLabel="Remove">
											<Icon
												as={XIcon}
												className="size-3 text-muted-foreground"
											/>
										</QueueItemAction>
									</QueueItemActions>
								</View>
								<QueueItemDescription>
									Repro: send a long message and scroll up mid-stream
								</QueueItemDescription>
								<QueueItemAttachment>
									<QueueItemFile>screen-recording.mov</QueueItemFile>
								</QueueItemAttachment>
							</QueueItem>
							<QueueItem>
								<View className="flex-row items-start gap-2">
									<QueueItemIndicator completed />
									<QueueItemContent completed>
										Add haptics to the send button
									</QueueItemContent>
								</View>
							</QueueItem>
							<QueueItem>
								<View className="flex-row items-start gap-2">
									<QueueItemIndicator />
									<QueueItemContent>
										Polish the empty conversation state
									</QueueItemContent>
								</View>
							</QueueItem>
						</QueueList>
					</QueueSectionContent>
				</QueueSection>
			</Queue>
		</View>
	),
};
