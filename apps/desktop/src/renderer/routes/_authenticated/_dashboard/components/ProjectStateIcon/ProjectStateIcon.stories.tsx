import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectStateIcon } from "./ProjectStateIcon";

const meta = {
	component: ProjectStateIcon,
	decorators: [
		(Story) => (
			<div className="bg-background p-6">
				<Story />
			</div>
		),
	],
	args: { state: "started" },
} satisfies Meta<typeof ProjectStateIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InProgress: Story = {};
export const Planned: Story = { args: { state: "planned" } };
export const Paused: Story = { args: { state: "paused" } };
export const Completed: Story = { args: { state: "completed" } };
export const Canceled: Story = { args: { state: "canceled" } };
