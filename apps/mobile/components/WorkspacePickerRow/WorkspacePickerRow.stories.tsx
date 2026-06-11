import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { WorkspacePickerRow } from "./WorkspacePickerRow";

const meta: Meta<typeof WorkspacePickerRow> = {
	title: "Molecules/Sessions/WorkspacePickerRow",
	component: WorkspacePickerRow,
	parameters: {
		docs: {
			description: {
				component:
					"Row in the NewChatSheet workspace picker (UC-NAV §D). Branch + host icon + host name on line 1; subtitle (sessions count + recency or 'no sessions yet') on line 2.",
			},
		},
	},
	decorators: [
		(Story) => (
			<View className="flex-1 bg-background">
				<Story />
			</View>
		),
	],
	args: {
		branch: "chat-mobile-plan",
		hostName: "macbook",
		hostKind: "laptop",
		subtitle: "5 sessions · 2m ago",
		showChevron: true,
		onPress: () => {},
	},
	argTypes: {
		branch: { control: "text" },
		hostName: { control: "text" },
		hostKind: {
			control: { type: "select" },
			options: ["laptop", "cloud"],
		},
		subtitle: { control: "text" },
		showChevron: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof WorkspacePickerRow>;

export const Active: Story = {};

export const CloudHost: Story = {
	args: {
		branch: "api-rewrite",
		hostName: "cloud-1",
		hostKind: "cloud",
		subtitle: "3 sessions · 1h ago",
	},
};

export const EmptyWorkspace: Story = {
	args: {
		branch: "feature-x",
		hostName: "cloud-1",
		hostKind: "cloud",
		subtitle: "no sessions yet",
	},
};
