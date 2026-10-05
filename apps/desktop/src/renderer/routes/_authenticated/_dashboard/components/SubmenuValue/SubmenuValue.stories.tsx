import type { Meta, StoryObj } from "@storybook/react-vite";
import { SubmenuValue } from "./SubmenuValue";

const meta = {
	component: SubmenuValue,
	decorators: [
		(Story) => (
			<div className="w-56 bg-background p-6">
				<div className="flex items-center rounded-sm px-2 py-1.5 text-sm">
					<span>Group by</span>
					<Story />
				</div>
			</div>
		),
	],
	args: {
		children: "Status",
	},
} satisfies Meta<typeof SubmenuValue>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LongValue: Story = {
	args: { children: "Superset marketing site preview" },
};
