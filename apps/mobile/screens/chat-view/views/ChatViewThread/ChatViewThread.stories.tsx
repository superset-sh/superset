import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import type { ComposerState } from "../../types";
import { ChatViewThread } from "./ChatViewThread";

const COMPOSER_STATES: ComposerState[] = [
	"idle",
	"typing",
	"streaming",
	"sending",
	"disabled",
	"hidden",
];

const meta: Meta<typeof ChatViewThread> = {
	title: "Views/Chat/02-ChatView · Thread (canonical)",
	component: ChatViewThread,
	parameters: {
		docs: {
			description: {
				component:
					"UC-RENDER-01 §A — the CANONICAL chat view. Header + user message + streaming assistant turn + composer with Stop. Toggle `composerState` via the control to see how the composer collapses across the UC-COMP-* lifecycle without disturbing the rest of the layout.",
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
		composerState: "streaming",
	},
	argTypes: {
		composerState: {
			control: { type: "select" },
			options: COMPOSER_STATES,
			description:
				"Forwarded to Composer state — exercise the composer-state arc on a fully-populated thread.",
		},
	},
};

export default meta;

type Story = StoryObj<typeof ChatViewThread>;

export const Streaming: Story = {};

export const StoppedReadyToReply: Story = {
	args: { composerState: "idle" },
};

export const FollowupSending: Story = {
	args: { composerState: "sending" },
};

export const ComposerHidden: Story = {
	args: { composerState: "hidden" },
};
