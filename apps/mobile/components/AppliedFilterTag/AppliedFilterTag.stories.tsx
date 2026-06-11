import type { Meta, StoryObj } from "@storybook/react-native";
import { ScrollView, View } from "react-native";
import { AppliedFilterTag } from "./AppliedFilterTag";

const meta: Meta<typeof AppliedFilterTag> = {
	title: "Molecules/Sessions/AppliedFilterTag",
	component: AppliedFilterTag,
	parameters: {
		docs: {
			description: {
				component:
					"Dismissible filter chip (UC-NAV-08 §C). Workspace variant = git-branch icon + `branch · host`; status variant = colored status icon + label. Body and ✕ are separate tap targets.",
			},
		},
	},
	decorators: [
		(Story) => (
			<View className="flex-1 bg-background items-start p-4">
				<Story />
			</View>
		),
	],
	args: {
		kind: "workspace",
		label: "main · desktop",
		onPress: () => {},
		onDismiss: () => {},
	},
	argTypes: {
		kind: {
			control: { type: "select" },
			options: ["workspace", "status"],
		},
		label: { control: "text" },
	},
};

export default meta;

type Story = StoryObj<typeof AppliedFilterTag>;

export const Workspace: Story = {};

export const StatusStreaming: Story = {
	args: { kind: "status", label: "Streaming" },
};

export const HorizontalScrollRow: Story = {
	render: () => (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
		>
			<AppliedFilterTag kind="workspace" label="main · desktop" />
			<AppliedFilterTag kind="workspace" label="chat-mobile-plan · macbook" />
			<AppliedFilterTag kind="status" label="Streaming" />
			<AppliedFilterTag kind="status" label="Pause pending" />
		</ScrollView>
	),
};
