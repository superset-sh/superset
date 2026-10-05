import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskProjectIcon } from "renderer/routes/_authenticated/_dashboard/components/TaskProjectIcon";
import { fn } from "storybook/test";
import { ProjectIconPicker } from "./ProjectIconPicker";

const meta = {
	component: ProjectIconPicker,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => (
			<div className="h-[520px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		icon: "airplane",
		color: "#3b82f6",
		onChange: fn(),
		children: (
			<button
				type="button"
				className="flex size-9 items-center justify-center rounded-md border border-border"
			>
				<TaskProjectIcon icon="airplane" color="#3b82f6" className="size-5" />
			</button>
		),
	},
} satisfies Meta<typeof ProjectIconPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithIcon: Story = {};

export const NoIconYet: Story = {
	args: {
		icon: null,
		color: "#f97316",
		children: (
			<button
				type="button"
				className="flex size-9 items-center justify-center rounded-md border border-border"
			>
				<TaskProjectIcon icon={null} color="#f97316" className="size-5" />
			</button>
		),
	},
};
