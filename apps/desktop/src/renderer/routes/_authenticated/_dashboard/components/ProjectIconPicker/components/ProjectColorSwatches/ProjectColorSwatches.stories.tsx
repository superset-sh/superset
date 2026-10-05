import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ProjectColorSwatches } from "./ProjectColorSwatches";

const meta = {
	component: ProjectColorSwatches,
	decorators: [
		(Story) => (
			<div className="w-fit rounded-md border border-border bg-popover p-1.5">
				<Story />
			</div>
		),
	],
	args: { value: "#3b82f6", onChange: fn() },
} satisfies Meta<typeof ProjectColorSwatches>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BlueSelected: Story = {};
export const NoColor: Story = { args: { value: null } };
