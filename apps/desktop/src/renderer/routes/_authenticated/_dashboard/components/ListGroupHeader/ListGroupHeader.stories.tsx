import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ListGroupHeader } from "./ListGroupHeader";

const meta = {
	component: ListGroupHeader,
	decorators: [
		(Story) => (
			<div className="w-[640px] bg-background p-6">
				<table className="w-full">
					<tbody>
						<Story />
					</tbody>
				</table>
			</div>
		),
	],
	args: {
		leading: <span className="size-2 rounded-full bg-amber-500" />,
		label: "In progress",
		count: 4,
		colSpan: 4,
		isCollapsed: false,
		onToggle: fn(),
	},
} satisfies Meta<typeof ListGroupHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Expanded: Story = {};

export const Collapsed: Story = {
	args: { isCollapsed: true },
};

export const WithAction: Story = {
	args: { action: { label: "New workspace", onClick: fn() } },
};

export const Empty: Story = {
	args: { label: "Done", count: 0 },
};

export const ManyItems: Story = {
	args: { count: 1284 },
};

export const LongLabel: Story = {
	args: {
		label: "Waiting on review from someone outside the organization",
	},
};
