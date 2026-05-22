import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { ComposerRow, type ComposerRowVariant } from "./ComposerRow";

const VARIANTS: ComposerRowVariant[] = [
	"idle",
	"typing",
	"streaming",
	"sending",
];

const meta: Meta<typeof ComposerRow> = {
	title: "Molecules/ComposerRow",
	component: ComposerRow,
	parameters: {
		docs: {
			description: {
				component:
					"Composer cluster — single rounded container with Textarea on top and an action toolbar inside the same chrome below. Toolbar order mirrors the Claude iOS reference: LEFT [+ commands] [⚙ settings pill] · spacer · RIGHT [send / stop / dots]. 4 state variants drive the right-slot swap and editability. Composes vendor Textarea + first-party IconButton + ComposerSettingsButton + ProgressDots.",
			},
		},
		layout: "fullscreen",
	},
	args: {
		variant: "idle",
		placeholder: "Type a message…",
		settings: {
			modelName: "Sonnet 4.6",
			permissionMode: "default",
			thinkingLevel: "off",
		},
		onCommandsPress: () => {},
	},
	argTypes: {
		variant: {
			control: { type: "select" },
			options: VARIANTS,
			description:
				"idle (Send disabled) · typing (Send active) · streaming (Stop) · sending (ProgressDots)",
		},
		value: {
			control: "text",
			description: "Controlled textarea value",
		},
		placeholder: { control: "text" },
		commandsAccessibilityLabel: { control: "text" },
	},
};

export default meta;

type Story = StoryObj<typeof ComposerRow>;

export const Idle: Story = {};

export const Typing: Story = {
	args: {
		variant: "typing",
		value: "Refactor the relay tunnel reconnect loop",
	},
};

export const Streaming: Story = {
	args: { variant: "streaming" },
};

export const Sending: Story = {
	args: { variant: "sending", value: "Sending this message…" },
};

export const ThinkingOnPermissionAcceptEdits: Story = {
	args: {
		variant: "typing",
		value: "About to refactor",
		settings: {
			modelName: "Opus 4.7",
			permissionMode: "acceptEdits",
			thinkingLevel: "medium",
		},
	},
};

export const NoCommandsButton: Story = {
	args: { onCommandsPress: undefined },
};

export const NoSettingsButton: Story = {
	args: { settings: undefined },
};

export const Minimal: Story = {
	args: { settings: undefined, onCommandsPress: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"Composer with no leading toolbar buttons — just textarea + send. Useful for embedded contexts where settings/commands live elsewhere.",
			},
		},
	},
};

export const AllStates: Story = {
	render: () => (
		<View className="gap-3 max-w-sm w-full">
			{VARIANTS.map((v) => (
				<ComposerRow
					key={v}
					variant={v}
					value={v === "idle" ? "" : "Sample content"}
					settings={{
						modelName: "Sonnet 4.6",
						permissionMode: "default",
						thinkingLevel: "off",
					}}
					onCommandsPress={() => {}}
				/>
			))}
		</View>
	),
};
