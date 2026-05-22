import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { DeleteSessionDialog } from "./DeleteSessionDialog";

const meta: Meta<typeof DeleteSessionDialog> = {
	title: "Views/Shared/Delete session dialog",
	component: DeleteSessionDialog,
	parameters: {
		docs: {
			description: {
				component:
					"UC-SESS-05 §A — destructive confirmation dialog over a dimmed chat view. ConfirmationDialog organism with `destructive` variant (red action button). Cancel / Delete buttons.",
			},
		},
		layout: "fullscreen",
	},
	decorators: [
		(Story) => (
			<View className="flex-1 bg-background">
				<Story />
			</View>
		),
	],
	args: {
		sessionTitle: "Fix auth bug",
		autoOpen: true,
		onConfirm: () => {},
	},
	argTypes: {
		sessionTitle: { control: "text" },
		autoOpen: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof DeleteSessionDialog>;

export const Default: Story = {};

export const LongTitle: Story = {
	args: {
		sessionTitle:
			"Refactor relay tunnel reconnect loop with exponential backoff + jitter",
	},
};
