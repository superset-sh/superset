import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import {
	LoadingSkeleton,
	type LoadingSkeletonDensity,
} from "./LoadingSkeleton";

const DENSITIES: LoadingSkeletonDensity[] = ["sparse", "dense"];

const meta: Meta<typeof LoadingSkeleton> = {
	title: "Organisms/LoadingSkeleton",
	component: LoadingSkeleton,
	parameters: {
		docs: {
			description: {
				component:
					"Loading placeholder for the chat thread — alternating-width message-bubble shapes pulsing via the vendor Skeleton primitive. Used during UC-SESS-02 §A history fetch. Composes vendor Skeleton (uniwind tokenized).",
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
		density: "sparse",
	},
	argTypes: {
		density: {
			control: { type: "select" },
			options: DENSITIES,
			description:
				"sparse = 3 placeholder bubbles · dense = 6 placeholder bubbles",
		},
		messageCount: {
			control: { type: "number", min: 1, max: 12, step: 1 },
			description: "Override the density preset with an explicit count",
		},
	},
};

export default meta;

type Story = StoryObj<typeof LoadingSkeleton>;

export const Sparse: Story = {};

export const Dense: Story = {
	args: { density: "dense" },
};

export const SingleMessage: Story = {
	args: { messageCount: 1 },
};
