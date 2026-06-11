import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Composer, type ComposerState } from "./Composer";

const STATES: ComposerState[] = [
	"idle",
	"typing",
	"streaming",
	"sending",
	"disabled",
	"hidden",
];

const BASE_ROW_PROPS = {
	placeholder: "Type a message…",
	settings: {
		modelName: "Sonnet 4.6",
		permissionMode: "default" as const,
		thinkingLevel: "off" as const,
	},
	onCommandsPress: () => {},
};

const meta: Meta<typeof Composer> = {
	title: "Organisms/Composer",
	component: Composer,
	parameters: {
		docs: {
			description: {
				component:
					"Keyboard-avoiding composer shell. Wraps ComposerRow with bottom safe-area inset + platform-aware KeyboardAvoidingView + suppression states (hidden during UC-PAUSE-01 approval). UC-COMP-01 (idle/typing) · UC-COMP-03 (streaming/sending) · UC-PAUSE-01 (hidden) · UC-PLATF-03 (disabled when host offline).",
			},
		},
		layout: "fullscreen",
	},
	decorators: [
		(Story) => (
			<View className="flex-1 bg-background justify-end">
				<Story />
			</View>
		),
	],
	args: {
		state: "idle",
		rowProps: BASE_ROW_PROPS,
	},
	argTypes: {
		state: {
			control: { type: "select" },
			options: STATES,
			description:
				"idle · typing · streaming · sending · disabled (read-only) · hidden (returns null)",
		},
	},
};

export default meta;

type Story = StoryObj<typeof Composer>;

export const Idle: Story = {};

export const Typing: Story = {
	args: {
		state: "typing",
		rowProps: {
			...BASE_ROW_PROPS,
			value: "Refactor the relay tunnel reconnect loop",
		},
	},
};

export const Streaming: Story = { args: { state: "streaming" } };

export const Sending: Story = { args: { state: "sending" } };

export const DisabledOffline: Story = { args: { state: "disabled" } };

export const Hidden: Story = { args: { state: "hidden" } };
