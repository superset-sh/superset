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
					"Composer cluster — ComposerSettingsButton (top) + Textarea + send/stop IconButton (bottom). 4 state variants: idle (Send disabled) · typing (Send active) · streaming (Stop) · sending (ProgressDots). Settings button replaces legacy 3-picker toolbar per desktop PR #4866 / SUPER-755.",
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
	},
	argTypes: {
		variant: {
			control: { type: "select" },
			options: VARIANTS,
			description:
				"idle (Send disabled) · typing (Send active) · streaming (Stop) · sending (dots)",
		},
		value: {
			control: "text",
			description: "Controlled textarea value",
		},
		placeholder: { control: "text" },
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

export const NoSettingsButton: Story = {
	args: { settings: undefined },
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
				/>
			))}
		</View>
	),
};
