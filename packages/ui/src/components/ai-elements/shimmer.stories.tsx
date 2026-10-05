import type { Meta, StoryObj } from "@storybook/react-vite";
import { Shimmer } from "./shimmer";

const meta = {
	title: "AI Elements/Shimmer",
	component: Shimmer,
	args: { children: "Working…" },
	decorators: [
		(Story) => (
			<div className="bg-background p-8 text-sm">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof Shimmer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ChatTempo: Story = {
	args: { duration: 1.2 },
};

export const Text: Story = {
	args: {
		variant: "text",
		children: "Refactor the transcript rows and update the tests",
	},
};
