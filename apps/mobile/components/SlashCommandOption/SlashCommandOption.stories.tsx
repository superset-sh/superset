import type { Meta, StoryObj } from "@storybook/react-native";
import {
	Brain,
	Eraser,
	type LucideIcon,
	Sparkles,
	Square,
} from "lucide-react-native";
import { View } from "react-native";
import { SlashCommandOption } from "./SlashCommandOption";

const ICON_MAP: Record<string, LucideIcon> = {
	Sparkles,
	Brain,
	Square,
	Eraser,
};

const meta: Meta<typeof SlashCommandOption> = {
	title: "Molecules/SlashCommandOption",
	component: SlashCommandOption,
	parameters: {
		docs: {
			description: {
				component:
					"Single row in the slash-command popover. Slash-prefixed name (accent mono) + description + source badge. 3 source variants — builtin (BUILT-IN neutral) · project (PROJECT accent) · user (USER live). 44pt min-height, isHighlighted for keyboard focus, isLoading swaps to ProgressDots.",
			},
		},
		layout: "fullscreen",
	},
	args: {
		name: "/model",
		description: "Switch model",
		source: "builtin",
		isHighlighted: false,
		isLoading: false,
		disabled: false,
	},
	argTypes: {
		name: { control: "text", description: "Slash-prefixed command name" },
		description: { control: "text", description: "Short description" },
		source: {
			control: { type: "select" },
			options: ["builtin", "project", "user"],
			description: "Source kind — drives badge variant",
		},
		icon: {
			control: { type: "select" },
			options: ["(none)", ...Object.keys(ICON_MAP)],
			mapping: { "(none)": undefined, ...ICON_MAP },
		},
		isHighlighted: { control: "boolean" },
		isLoading: { control: "boolean" },
		disabled: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof SlashCommandOption>;

export const Builtin: Story = {};

export const Project: Story = {
	args: {
		name: "/deploy",
		description: "Deploy current branch to staging",
		source: "project",
	},
};

export const User: Story = {
	args: {
		name: "/snippets",
		description: "Insert a personal snippet",
		source: "user",
	},
};

export const Highlighted: Story = {
	args: { isHighlighted: true },
};

export const Loading: Story = {
	args: { isLoading: true },
};

export const WithIcon: Story = {
	args: { icon: Sparkles },
};

export const InPopoverList: Story = {
	render: () => (
		<View className="bg-popover border border-border rounded-lg max-w-sm w-full overflow-hidden">
			<SlashCommandOption
				name="/model"
				description="Switch model"
				source="builtin"
				icon={Sparkles}
			/>
			<SlashCommandOption
				name="/think"
				description="Adjust thinking level"
				source="builtin"
				icon={Brain}
				isHighlighted
			/>
			<SlashCommandOption
				name="/stop"
				description="Stop the current turn"
				source="builtin"
				icon={Square}
			/>
			<SlashCommandOption
				name="/clear"
				description="Clear the conversation"
				source="builtin"
				icon={Eraser}
			/>
			<SlashCommandOption
				name="/deploy"
				description="Deploy current branch"
				source="project"
			/>
		</View>
	),
};
