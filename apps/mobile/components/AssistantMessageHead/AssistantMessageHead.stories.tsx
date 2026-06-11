import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import {
	AssistantMessageHead,
	type AssistantMessageHeadVariant,
} from "./AssistantMessageHead";

const VARIANTS: AssistantMessageHeadVariant[] = [
	"idle",
	"streaming",
	"thinking",
	"paused",
	"completed",
];

const meta: Meta<typeof AssistantMessageHead> = {
	title: "Molecules/AssistantMessageHead",
	component: AssistantMessageHead,
	parameters: {
		docs: {
			description: {
				component:
					"Header row for an assistant message (UC-RENDER-01). Avatar + ASSISTANT label + · + timestamp + optional status segment. 5 variants drive status visibility: idle (none) · streaming · thinking · paused · completed. Composes vendor Avatar + first-party StatusDot + Text.",
			},
		},
		layout: "centered",
	},
	args: {
		initials: "A",
		label: "ASSISTANT",
		timestamp: "12:43 PM",
		variant: "idle",
	},
	argTypes: {
		initials: { control: "text" },
		label: { control: "text" },
		timestamp: { control: "text" },
		variant: { control: { type: "select" }, options: VARIANTS },
		completedDuration: { control: "text" },
	},
};

export default meta;

type Story = StoryObj<typeof AssistantMessageHead>;

export const Idle: Story = {};

export const Streaming: Story = { args: { variant: "streaming" } };

export const Thinking: Story = { args: { variant: "thinking" } };

export const Paused: Story = { args: { variant: "paused" } };

export const Completed: Story = {
	args: { variant: "completed", completedDuration: "3.2s" },
};

export const AllVariants: Story = {
	render: () => (
		<View className="gap-3 p-4">
			{VARIANTS.map((v) => (
				<AssistantMessageHead
					key={v}
					timestamp="12:43 PM"
					variant={v}
					completedDuration={v === "completed" ? "3.2s" : undefined}
				/>
			))}
		</View>
	),
};
