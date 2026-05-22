import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { MOCK_SLASH_COMMANDS } from "../../mock-data";
import { ChatViewSlashMenu } from "./ChatViewSlashMenu";

const meta: Meta<typeof ChatViewSlashMenu> = {
	title: "Views/Chat/02-ChatView · Slash-command popover",
	component: ChatViewSlashMenu,
	parameters: {
		docs: {
			description: {
				component:
					"UC-COMP-01 §C — slash-command popover floating above the composer with built-in + user-scoped commands separated by a divider. The composer textarea reflects the selected command name (via useState).",
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
	args: { open: true, highlightedIndex: 0 },
	argTypes: {
		open: { control: "boolean" },
		highlightedIndex: {
			control: { type: "number", min: 0, max: MOCK_SLASH_COMMANDS.length - 1 },
			description: "Arrow-key focus index across builtins + custom rows.",
		},
	},
};

export default meta;

type Story = StoryObj<typeof ChatViewSlashMenu>;

export const Default: Story = {};

export const HighlightSecond: Story = {
	args: { highlightedIndex: 1 },
};

export const HighlightCustom: Story = {
	args: { highlightedIndex: 3 },
	parameters: {
		docs: {
			description: {
				story:
					"Highlights a custom (project / user) command — the row below the built-ins divider.",
			},
		},
	},
};

export const Closed: Story = {
	args: { open: false },
};

/**
 * Interactive — uses useState to toggle the popover open/closed.
 */
export const InteractiveToggle: Story = {
	render: () => {
		const [open, setOpen] = useState(true);
		return (
			<View className="flex-1">
				<ChatViewSlashMenu open={open} highlightedIndex={0} />
				<View className="absolute top-20 right-3">
					<View
						accessibilityRole="button"
						className="bg-secondary px-3 py-2 rounded-md"
						onTouchEnd={() => setOpen((o) => !o)}
					/>
				</View>
			</View>
		);
	},
};
