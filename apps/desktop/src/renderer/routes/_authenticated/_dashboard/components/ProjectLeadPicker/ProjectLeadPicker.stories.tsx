import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ProjectLeadPicker } from "./ProjectLeadPicker";

const meta = {
	component: ProjectLeadPicker,
	decorators: [
		(Story) => (
			<div className="bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		people: [
			{ id: "satya", name: "Satya Patel", image: null },
			{ id: "kiet", name: "Kiet Ho", image: null },
		],
		value: "satya",
		onChange: fn(),
		children: (
			<button
				type="button"
				className="rounded-md border border-border/60 px-2 py-1 text-xs"
			>
				Pick a lead
			</button>
		),
	},
} satisfies Meta<typeof ProjectLeadPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithLead: Story = {};

export const NoLead: Story = {
	args: { value: null },
};

export const WithInvite: Story = {
	args: { onInvite: fn() },
};
