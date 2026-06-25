import type { Meta, StoryObj } from "@storybook/react-native";
import { FileTextIcon, SearchIcon } from "lucide-react-native";
import { View } from "react-native";
import {
	ChainOfThought,
	ChainOfThoughtContent,
	ChainOfThoughtHeader,
	ChainOfThoughtSearchResult,
	ChainOfThoughtSearchResults,
	ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import { Text } from "@/components/ui/text";

const meta = {
	title: "ai-elements/ChainOfThought",
	component: ChainOfThought,
} satisfies Meta<typeof ChainOfThought>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Expanded: Story = {
	render: () => (
		<View className="w-full">
			<ChainOfThought defaultOpen>
				<ChainOfThoughtHeader />
				<ChainOfThoughtContent>
					<ChainOfThoughtStep
						icon={SearchIcon}
						label="Searching the codebase"
						status="complete"
					>
						<ChainOfThoughtSearchResults>
							<ChainOfThoughtSearchResult>
								<Text>conversation.tsx</Text>
							</ChainOfThoughtSearchResult>
							<ChainOfThoughtSearchResult>
								<Text>message.tsx</Text>
							</ChainOfThoughtSearchResult>
						</ChainOfThoughtSearchResults>
					</ChainOfThoughtStep>
					<ChainOfThoughtStep
						description="Reading scroll handling in the conversation list"
						icon={FileTextIcon}
						label="Analyzing scroll behavior"
						status="active"
					/>
					<ChainOfThoughtStep label="Drafting the answer" status="pending" />
				</ChainOfThoughtContent>
			</ChainOfThought>
		</View>
	),
};

export const Collapsed: Story = {
	render: () => (
		<View className="w-full">
			<ChainOfThought>
				<ChainOfThoughtHeader>Planning the refactor</ChainOfThoughtHeader>
				<ChainOfThoughtContent>
					<ChainOfThoughtStep label="Hidden until expanded" />
				</ChainOfThoughtContent>
			</ChainOfThought>
		</View>
	),
};
