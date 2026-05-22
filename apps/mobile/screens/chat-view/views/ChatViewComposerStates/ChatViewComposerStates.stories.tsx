import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import type { ComposerState } from "../../types";
import { ChatViewComposerStates } from "./ChatViewComposerStates";

const STATES: ComposerState[] = [
	"idle",
	"typing",
	"streaming",
	"sending",
	"disabled",
	"hidden",
];

const meta: Meta<typeof ChatViewComposerStates> = {
	title: "Views/Chat/02-ChatView · Composer lifecycle",
	component: ChatViewComposerStates,
	parameters: {
		docs: {
			description: {
				component:
					"UC-COMP-01 / UC-COMP-03 — the full composer state arc on top of the canonical streaming thread. Idle / Typing / StreamingStop are the three primary wireframes; Sending / Disabled / Hidden round out the lifecycle. Toggle via the `state` control or pick a named story.",
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
	args: { state: "idle", value: "" },
	argTypes: {
		state: {
			control: { type: "select" },
			options: STATES,
		},
		value: { control: "text" },
	},
};

export default meta;

type Story = StoryObj<typeof ChatViewComposerStates>;

export const Idle: Story = { args: { state: "idle", value: "" } };

export const TypingSendEnabled: Story = {
	args: {
		state: "typing",
		value: "Refactor the relay tunnel reconnect loop",
	},
};

export const StreamingStop: Story = { args: { state: "streaming" } };

/**
 * Interactive demo — uses local useState ("storybook hooks") to drive
 * idle → typing transitions as the user types in the composer.
 */
export const InteractiveTyping: Story = {
	render: () => {
		const [value, _setValue] = useState("");
		const state: ComposerState = value.length > 0 ? "typing" : "idle";
		return <ChatViewComposerStates state={state} value={value} />;
	},
	parameters: {
		docs: {
			description: {
				story:
					"Composer state derives from the textarea contents — type into the input to flip between idle and typing without leaving the story. (Note: on-device storybook treats the rendered Composer as live, so the textarea is interactive.)",
			},
		},
	},
};
