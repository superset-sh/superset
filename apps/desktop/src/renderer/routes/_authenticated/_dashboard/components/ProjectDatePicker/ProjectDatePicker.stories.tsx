import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ProjectDatePicker } from "./ProjectDatePicker";

const meta = {
	component: ProjectDatePicker,
	decorators: [
		(Story) => (
			<div className="bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		value: null,
		onChange: fn(),
		children: (
			<button
				type="button"
				className="rounded-md border border-border/60 px-2 py-1 text-xs"
			>
				Pick a date
			</button>
		),
	},
} satisfies Meta<typeof ProjectDatePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Chosen: Story = {
	args: { value: "2026-10-18" },
};
