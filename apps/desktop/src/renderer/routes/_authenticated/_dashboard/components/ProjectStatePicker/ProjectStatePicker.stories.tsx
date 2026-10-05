import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ProjectStatePicker } from "./ProjectStatePicker";

const meta = {
	component: ProjectStatePicker,
	decorators: [
		(Story) => (
			<div className="w-[320px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		value: "planned",
		onChange: fn(),
		children: (
			<button
				type="button"
				className="rounded-md border border-border/60 px-2 py-1 text-xs"
			>
				Pick a status
			</button>
		),
	},
} satisfies Meta<typeof ProjectStatePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Planned: Story = {};

export const Started: Story = {
	args: { value: "started" },
};

export const Paused: Story = {
	args: { value: "paused" },
};

export const Completed: Story = {
	args: { value: "completed" },
};

export const Canceled: Story = {
	args: { value: "canceled" },
};
