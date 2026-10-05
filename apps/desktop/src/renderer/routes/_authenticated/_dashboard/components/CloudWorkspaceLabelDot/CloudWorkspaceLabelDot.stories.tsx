import type { Meta, StoryObj } from "@storybook/react-vite";
import { CloudWorkspaceLabelDot } from "./CloudWorkspaceLabelDot";

const meta = {
	component: CloudWorkspaceLabelDot,
	decorators: [
		(Story) => (
			<div className="w-[120px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: { color: "#ef4444" },
} satisfies Meta<typeof CloudWorkspaceLabelDot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Colored: Story = {};

export const NoColor: Story = { args: { color: null } };
