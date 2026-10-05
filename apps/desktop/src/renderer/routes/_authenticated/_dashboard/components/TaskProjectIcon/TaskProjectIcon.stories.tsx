import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskProjectIcon } from "./TaskProjectIcon";

const meta = {
	component: TaskProjectIcon,
	decorators: [
		(Story) => (
			<div className="w-[120px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: { color: "#f97316" },
} satisfies Meta<typeof TaskProjectIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Colored: Story = {};

export const NoColor: Story = { args: { color: null } };
