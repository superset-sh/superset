import type { Meta, StoryObj } from "@storybook/react-native";
import { Brain, Hammer, Settings, Sparkles, Wrench } from "lucide-react-native";
import { View } from "react-native";
import { type SlashCommand, SlashCommandPopover } from "./SlashCommandPopover";

const COMMANDS: SlashCommand[] = [
	{
		id: "model",
		name: "/model",
		description: "Switch the active model",
		source: "builtin",
		icon: Sparkles,
	},
	{
		id: "thinking",
		name: "/thinking",
		description: "Set extended thinking level",
		source: "builtin",
		icon: Brain,
	},
	{
		id: "permission",
		name: "/permission",
		description: "Change permission mode",
		source: "builtin",
		icon: Settings,
	},
	{
		id: "refactor",
		name: "/refactor",
		description: "Project: launch the refactor recipe",
		source: "project",
		icon: Hammer,
	},
	{
		id: "fix-tests",
		name: "/fix-tests",
		description: "User: re-run failing tests and fix",
		source: "user",
		icon: Wrench,
	},
];

const meta: Meta<typeof SlashCommandPopover> = {
	title: "Organisms/SlashCommandPopover",
	component: SlashCommandPopover,
	parameters: {
		docs: {
			description: {
				component:
					"Slash-command list shown above the composer when the input starts with '/'. Composes SlashCommandOption rows in groups (built-ins, then a Separator, then project + user commands). UC-COMP-01 §C.",
			},
		},
		layout: "fullscreen",
	},
	decorators: [
		(Story) => (
			<View className="flex-1 bg-background justify-end p-4">
				<Story />
			</View>
		),
	],
	args: {
		open: true,
		commands: COMMANDS,
		highlightedIndex: 0,
	},
	argTypes: {
		open: { control: "boolean" },
		highlightedIndex: {
			control: { type: "number", min: 0, max: 10, step: 1 },
		},
		emptyLabel: { control: "text" },
	},
};

export default meta;

type Story = StoryObj<typeof SlashCommandPopover>;

export const AllCommands: Story = {};

export const BuiltinsOnly: Story = {
	args: { commands: COMMANDS.filter((c) => c.source === "builtin") },
};

export const CustomOnly: Story = {
	args: { commands: COMMANDS.filter((c) => c.source !== "builtin") },
};

export const Empty: Story = { args: { commands: [] } };
